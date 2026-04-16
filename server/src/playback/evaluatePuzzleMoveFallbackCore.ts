import { PUZZLE_PLAYBACK_CONFIG } from "../config/puzzlePlaybackConfig";
import type { ImportScanResult } from "../types/importTypes";
import { evaluationForPuzzleSide, evalWithinTolerance } from "./scanEvalInterpretation";
import type { ScanEvalBand } from "./runtimeValidationTypes";

export type PuzzleMoveFallbackReason =
  | "exact_authored_match"
  | "scan_fallback_preserved_win"
  | "scan_fallback_eval_drop_too_large"
  | "scan_fallback_not_winning"
  | "scan_fallback_baseline_missing"
  | "scan_fallback_baseline_not_strong_enough"
  | "scan_fallback_disabled"
  | "illegal_move"
  | "scan_failed"
  | "lesson_strict_no_fallback";

export type EvaluatePuzzleMoveFallbackCoreInput = {
  stepType: string;
  /** When true, never allow Scan fallback (e.g. sequence teaching step). */
  strictAuthoredOnly: boolean;
  scanFallbackEnabled: boolean;
  moveLegal: boolean;
  puzzleSide: "white" | "black";
  resultingFen: string;
  resultingSideToMove: "white" | "black";
  baselineEvaluation: number | null;
  /** Reserved for stricter policies (e.g. forced-win preservation). */
  baselineBand: ScanEvalBand;
  scanResult: ImportScanResult | null;
  policy?: Partial<typeof PUZZLE_PLAYBACK_CONFIG>;
};

export type EvaluatePuzzleMoveFallbackCoreResult = {
  accepted: boolean;
  reason: PuzzleMoveFallbackReason;
  scanResult: ImportScanResult | null;
};

function fenSideToMove(fen: string): "white" | "black" | null {
  const s = fen.trim().split(":")[0]?.trim();
  if (s === "W") return "white";
  if (s === "B") return "black";
  return null;
}

/**
 * Conservative Scan-assisted acceptance when exact authored match failed.
 * Pure logic — inject `scanResult` from your Scan engine (Roblox or server).
 */
export function evaluatePuzzleMoveFallbackCore(
  input: EvaluatePuzzleMoveFallbackCoreInput
): EvaluatePuzzleMoveFallbackCoreResult {
  const policy = { ...PUZZLE_PLAYBACK_CONFIG, ...input.policy };

  if (input.strictAuthoredOnly) {
    return {
      accepted: false,
      reason: "lesson_strict_no_fallback",
      scanResult: input.scanResult,
    };
  }

  if (!input.scanFallbackEnabled) {
    return {
      accepted: false,
      reason: "scan_fallback_disabled",
      scanResult: input.scanResult,
    };
  }

  if (!input.moveLegal) {
    return { accepted: false, reason: "illegal_move", scanResult: input.scanResult };
  }

  const scan = input.scanResult;
  if (!scan || typeof scan.evaluation !== "number" || !Number.isFinite(scan.evaluation)) {
    return { accepted: false, reason: "scan_failed", scanResult: input.scanResult };
  }

  if (input.baselineEvaluation === null) {
    return {
      accepted: false,
      reason: "scan_fallback_baseline_missing",
      scanResult: input.scanResult,
    };
  }

  if (input.baselineBand !== "winning" && input.baselineBand !== "large_advantage") {
    return {
      accepted: false,
      reason: "scan_fallback_baseline_not_strong_enough",
      scanResult: input.scanResult,
    };
  }

  const stm = fenSideToMove(input.resultingFen) ?? input.resultingSideToMove;

  const evalAfterForPuzzle = evaluationForPuzzleSide({
    evaluation: scan.evaluation,
    fenSideToMove: stm,
    puzzleSide: input.puzzleSide,
  });

  /** Baseline scan was taken at puzzle start; treat as puzzle-side perspective already. */
  const baselineForPuzzle = input.baselineEvaluation;

  if (!evalWithinTolerance(baselineForPuzzle, evalAfterForPuzzle, policy.evalTolerance)) {
    return {
      accepted: false,
      reason: "scan_fallback_eval_drop_too_large",
      scanResult: input.scanResult,
    };
  }

  if (evalAfterForPuzzle < policy.winningThreshold) {
    return {
      accepted: false,
      reason: "scan_fallback_not_winning",
      scanResult: input.scanResult,
    };
  }

  return {
    accepted: true,
    reason: "scan_fallback_preserved_win",
    scanResult: input.scanResult,
  };
}
