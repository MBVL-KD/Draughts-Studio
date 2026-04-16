import {
  getImportJobById,
  incrementJobProgress,
  updateImportJobStatus,
} from "../repositories/importJobRepository";
import {
  getNextPendingItem,
  markItemDone,
  markItemFailed,
  markItemProcessing,
  markItemSkipped,
  resetFailedItems,
  resetStaleProcessingItems,
  resetSkippedItems,
} from "../repositories/importItemRepository";
import type { ImportScanResult } from "../types/importTypes";
import { getLessonAppId } from "../utils/idResolvers";
import { appendImportedPuzzleStep } from "./puzzelsImportBooksService";
import { getImportAdapter } from "../import/adapters";
import { convertSlagzetItemToLessonStep } from "../import/normalize/slagzetToStep";
import { applyScanResultToImportedStep } from "../import/normalize/applyScanToImportedStep";
import { runImportScanAnalysis } from "../engine/importScan/runImportScanAnalysis";
import { ConflictError } from "../utils/httpErrors";
import { trimPvToCombinationWindow } from "../import/normalize/parsePvMoves";
import { resolveNotationLineToStructuredMovesDetailed } from "../playback/resolveNotationLineToStructuredMoves";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type RunAction = "processed" | "completed" | "paused" | "idle" | "failed";
const MIN_EVAL_ADVANTAGE_FOR_PUZZLE = 0.5;
const FAST_SCAN_DEPTH = 10;
const DEEP_SCAN_DEPTH = 25;
const STALE_PROCESSING_REQUEUE_MS = 90_000;

export type ImportRunnerResult = {
  action: RunAction;
  jobId: string;
  itemId?: string;
  importedStepId?: string;
  message?: string;
  counters?: {
    totalItems: number;
    processedItems: number;
    successfulItems: number;
    failedItems: number;
    currentIndex: number;
    status: string;
  };
};

function toCounterSnapshot(job: Record<string, any>) {
  return {
    totalItems: Number(job.totalItems ?? 0),
    processedItems: Number(job.processedItems ?? 0),
    successfulItems: Number(job.successfulItems ?? 0),
    failedItems: Number(job.failedItems ?? 0),
    currentIndex: Number(job.currentIndex ?? 0),
    status: String(job.status ?? "idle"),
  };
}

function buildImportFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown import error";
  }
}

function isRecoverableScanError(error: unknown): boolean {
  const message = buildImportFailureMessage(error).toLowerCase();
  return (
    message.includes("bridge call failed") ||
    message.includes("aborted(undefined)") ||
    message.includes("scan_analyze_fen")
  );
}

async function runOptionalImportScan(params: {
  enabled: boolean;
  depth?: number;
  multiPv?: number;
  step: Record<string, any>;
  variantId: string;
}): Promise<{ scanResult: ImportScanResult; step: Record<string, any> } | undefined> {
  if (!params.enabled) return undefined;
  const fen =
    typeof params.step?.initialState?.fen === "string" ? params.step.initialState.fen : "";
  const depth =
    typeof params.depth === "number" && Number.isFinite(params.depth)
      ? params.depth
      : 10;
  try {
    const scanResult = await runImportScanAnalysis({
      variantId: params.variantId,
      fen,
      depth,
      multiPv: params.multiPv,
    });
    const merged = applyScanResultToImportedStep(params.step as any, scanResult);
    return { scanResult, step: merged as Record<string, any> };
  } catch (error) {
    if (!isRecoverableScanError(error)) throw error;
    return undefined;
  }
}

function hasStrongStarterAdvantage(
  evalValue: number,
  starterSide: "white" | "black"
): boolean {
  return starterSide === "white"
    ? evalValue >= MIN_EVAL_ADVANTAGE_FOR_PUZZLE
    : evalValue <= -MIN_EVAL_ADVANTAGE_FOR_PUZZLE;
}

async function evaluateCombinationEndPosition(params: {
  enabled: boolean;
  variantId: string;
  step: Record<string, any>;
  scanResult?: ImportScanResult;
  depth: number;
  multiPv?: number;
}): Promise<number | null> {
  if (!params.enabled || !params.scanResult) return null;
  const initialFen = String(params.step?.initialState?.fen ?? "").trim();
  if (!initialFen) return null;
  const starter = params.step?.initialState?.sideToMove === "black" ? "black" : "white";
  const pvMoves = Array.isArray(params.scanResult.pv) ? params.scanResult.pv : [];
  const comboWindow = trimPvToCombinationWindow(pvMoves, starter);
  if (comboWindow.length === 0) return null;

  const resolved = resolveNotationLineToStructuredMovesDetailed(initialFen, comboWindow);
  if (!resolved.ok || resolved.moves.length === 0) return null;
  const endFen = resolved.moves[resolved.moves.length - 1]?.fenAfter;
  if (typeof endFen !== "string" || !endFen.trim()) return null;

  const endScan = await runImportScanAnalysis({
    variantId: params.variantId,
    fen: endFen,
    depth: params.depth,
    multiPv: params.multiPv,
  });
  const endEval = Number(endScan.evaluation);
  return Number.isFinite(endEval) ? endEval : null;
}

export async function runImportJobOnce(
  owner: OwnerContext,
  jobId: string
): Promise<ImportRunnerResult> {
  await resetStaleProcessingItems(owner, jobId, STALE_PROCESSING_REQUEUE_MS);
  const job = await getImportJobById(owner, jobId);
  if (job.status === "paused") {
    return { action: "paused", jobId, counters: toCounterSnapshot(job), message: "Job is paused" };
  }
  if (job.status === "completed") {
    return { action: "completed", jobId, counters: toCounterSnapshot(job), message: "Job already completed" };
  }
  if (job.status === "failed") {
    return { action: "failed", jobId, counters: toCounterSnapshot(job), message: "Job is failed" };
  }
  if (job.status === "idle") {
    return { action: "idle", jobId, counters: toCounterSnapshot(job), message: "Job is idle" };
  }

  let pendingItem = await getNextPendingItem(owner, jobId);
  if (!pendingItem) {
    const completed = await updateImportJobStatus(owner, jobId, "completed", job.revision);
    return {
      action: "completed",
      jobId,
      counters: toCounterSnapshot(completed),
      message: "No pending items left",
    };
  }

  // Another runner can claim the same pending item between read and update.
  // Retry a few times to claim the next available pending item before failing.
  let processingItem: Awaited<ReturnType<typeof markItemProcessing>> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      processingItem = await markItemProcessing(owner, pendingItem.itemId, pendingItem.revision);
      break;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      pendingItem = await getNextPendingItem(owner, jobId);
      if (!pendingItem) {
        const latestJob = await getImportJobById(owner, jobId);
        if (latestJob.status === "running") {
          const completed = await updateImportJobStatus(
            owner,
            jobId,
            "completed",
            latestJob.revision
          );
          return {
            action: "completed",
            jobId,
            counters: toCounterSnapshot(completed),
            message: "No pending items left",
          };
        }
        return {
          action: "processed",
          jobId,
          counters: toCounterSnapshot(latestJob),
          message: "Pending item claimed by another runner",
        };
      }
    }
  }
  if (!processingItem) {
    const latestJob = await getImportJobById(owner, jobId);
    return {
      action: "processed",
      jobId,
      counters: toCounterSnapshot(latestJob),
      message: "Could not claim pending item after retries",
    };
  }

  try {
    const adapter = getImportAdapter(job.sourceType);
    const scrapedItem = await adapter.scrapeCollectionItem(processingItem.fragmentUrl);
    let step: Record<string, any> = convertSlagzetItemToLessonStep({
      job: job as any,
      item: processingItem as any,
      scrapedItem,
    });

    const scanEnabled = Boolean(job.scanConfig?.enabled);
    const variantId = "international";
    const configuredDepth =
      typeof job.scanConfig?.depth === "number" && Number.isFinite(job.scanConfig.depth)
        ? Math.max(1, Math.floor(job.scanConfig.depth))
        : FAST_SCAN_DEPTH;
    const fastDepth = Math.min(configuredDepth, FAST_SCAN_DEPTH);
    const deepDepth = Math.max(configuredDepth, DEEP_SCAN_DEPTH);

    let scanBundle = await runOptionalImportScan({
      enabled: scanEnabled,
      depth: fastDepth,
      multiPv: job.scanConfig?.multiPv,
      step,
      variantId,
    });
    let scanResult: ImportScanResult | undefined;
    if (scanBundle) {
      step = scanBundle.step;
      scanResult = scanBundle.scanResult;
    }

    const evalValue = Number(scanResult?.evaluation);
    const starterSide = step?.initialState?.sideToMove === "black" ? "black" : "white";
    let hasStrongSideAdvantage =
      Number.isFinite(evalValue) && hasStrongStarterAdvantage(evalValue, starterSide);

    // Two-pass scan: fast depth first, deep (>=25) only when eval gate would skip.
    if (
      scanEnabled &&
      scanBundle &&
      Number.isFinite(evalValue) &&
      !hasStrongSideAdvantage &&
      deepDepth > fastDepth
    ) {
      const deepBundle = await runOptionalImportScan({
        enabled: true,
        depth: deepDepth,
        multiPv: job.scanConfig?.multiPv,
        step,
        variantId,
      });
      if (deepBundle) {
        scanBundle = deepBundle;
        step = deepBundle.step;
        scanResult = deepBundle.scanResult;
        const deepEval = Number(scanResult?.evaluation);
        hasStrongSideAdvantage =
          Number.isFinite(deepEval) && hasStrongStarterAdvantage(deepEval, starterSide);
      }
    }

    let endCombinationEval: number | null = null;
    if (scanEnabled && scanBundle && !hasStrongSideAdvantage) {
      try {
        endCombinationEval = await evaluateCombinationEndPosition({
          enabled: true,
          variantId,
          step,
          scanResult,
          depth: deepDepth,
          multiPv: job.scanConfig?.multiPv,
        });
        if (Number.isFinite(endCombinationEval)) {
          hasStrongSideAdvantage = hasStrongStarterAdvantage(endCombinationEval, starterSide);
        }
      } catch {
        // Keep import resilient; fallback to start-position gate.
      }
    }
    if (scanBundle && Number.isFinite(evalValue) && !hasStrongSideAdvantage) {
      const reason =
        starterSide === "white"
          ? `Skipped: eval too low for white-to-move puzzle (${evalValue.toFixed(
              2
            )} < ${MIN_EVAL_ADVANTAGE_FOR_PUZZLE}).`
          : `Skipped: eval not low enough for black-to-move puzzle (${evalValue.toFixed(
              2
            )} > -${MIN_EVAL_ADVANTAGE_FOR_PUZZLE}).`;
      const enrichedReason =
        Number.isFinite(endCombinationEval) && endCombinationEval !== null
          ? `${reason} Combination-end eval: ${endCombinationEval.toFixed(2)}.`
          : reason;
      const skippedItem = await markItemSkipped(
        owner,
        processingItem.itemId,
        { reason: enrichedReason, scanResult },
        processingItem.revision
      );
      const progressed = await incrementJobProgress(
        owner,
        jobId,
        {
          processedItemsInc: 1,
          currentIndex: pendingItem.index,
        },
        job.revision
      );
      return {
        action: "processed",
        jobId,
        itemId: skippedItem.itemId,
        counters: toCounterSnapshot(progressed),
        message: enrichedReason,
      };
    }

    const appended = await appendImportedPuzzleStep(owner, job as any, step);
    if (appended.skipped) {
      const skippedItem = await markItemSkipped(
        owner,
        processingItem.itemId,
        { reason: appended.skipReason ?? "Skipped: no valid sequence" },
        processingItem.revision
      );
      const progressed = await incrementJobProgress(
        owner,
        jobId,
        {
          processedItemsInc: 1,
          currentIndex: pendingItem.index,
        },
        job.revision
      );
      return {
        action: "processed",
        jobId,
        itemId: skippedItem.itemId,
        counters: toCounterSnapshot(progressed),
        message: appended.skipReason ?? "Skipped: no valid sequence",
      };
    }
    const doneItem = await markItemDone(
      owner,
      processingItem.itemId,
      {
        importedStepId: appended.importedStep.stepId,
        importedLessonId: getLessonAppId(appended.updatedLesson),
        scanResult,
      },
      processingItem.revision
    );

    const progressed = await incrementJobProgress(
      owner,
      jobId,
      {
        processedItemsInc: 1,
        successfulItemsInc: 1,
        currentIndex: pendingItem.index,
      },
      job.revision
    );

    return {
      action: "processed",
      jobId,
      itemId: doneItem.itemId,
      importedStepId: appended.importedStep.stepId,
      counters: toCounterSnapshot(progressed),
      message: "Item processed successfully",
    };
  } catch (error) {
    const message = buildImportFailureMessage(error);
    const failedItem = await markItemFailed(
      owner,
      processingItem.itemId,
      message,
      processingItem.revision
    );

    const progressed = await incrementJobProgress(
      owner,
      jobId,
      {
        processedItemsInc: 1,
        failedItemsInc: 1,
        currentIndex: pendingItem.index,
      },
      job.revision
    );

    return {
      action: "failed",
      jobId,
      itemId: failedItem.itemId,
      counters: toCounterSnapshot(progressed),
      message,
    };
  }
}

export async function runImportJobUntilStopped(
  owner: OwnerContext,
  jobId: string,
  options?: { maxItems?: number }
): Promise<ImportRunnerResult[]> {
  const maxItems =
    typeof options?.maxItems === "number" && Number.isFinite(options.maxItems)
      ? Math.max(1, Math.floor(options.maxItems))
      : Number.POSITIVE_INFINITY;

  let processed = 0;
  const results: ImportRunnerResult[] = [];

  while (processed < maxItems) {
    const currentJob = await getImportJobById(owner, jobId);
    if (currentJob.status === "paused") {
      results.push({
        action: "paused",
        jobId,
        counters: toCounterSnapshot(currentJob),
        message: "Stopped because job is paused",
      });
      break;
    }
    if (currentJob.status === "completed") {
      results.push({
        action: "completed",
        jobId,
        counters: toCounterSnapshot(currentJob),
        message: "Stopped because job is completed",
      });
      break;
    }
    if (currentJob.status === "failed") {
      results.push({
        action: "failed",
        jobId,
        counters: toCounterSnapshot(currentJob),
        message: "Stopped because job is failed",
      });
      break;
    }
    if (currentJob.status === "idle") {
      await updateImportJobStatus(owner, jobId, "running", currentJob.revision);
    }

    const result = await runImportJobOnce(owner, jobId);
    results.push(result);
    processed += 1;

    if (result.action === "paused" || result.action === "completed" || result.action === "idle") {
      break;
    }
  }

  return results;
}

export async function pauseImportJob(
  owner: OwnerContext,
  jobId: string,
  expectedRevision?: number
) {
  const job = await getImportJobById(owner, jobId);
  const revision = Number.isFinite(expectedRevision as number)
    ? (expectedRevision as number)
    : job.revision;
  return updateImportJobStatus(owner, jobId, "paused", revision);
}

export async function resumeImportJob(
  owner: OwnerContext,
  jobId: string,
  expectedRevision?: number
) {
  const job = await getImportJobById(owner, jobId);
  const revision = Number.isFinite(expectedRevision as number)
    ? (expectedRevision as number)
    : job.revision;
  return updateImportJobStatus(owner, jobId, "running", revision);
}

export async function retryFailedImportItems(owner: OwnerContext, jobId: string) {
  return resetFailedItems(owner, jobId);
}

export async function retrySkippedImportItems(owner: OwnerContext, jobId: string) {
  return resetSkippedItems(owner, jobId);
}
