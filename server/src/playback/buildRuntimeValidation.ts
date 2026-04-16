import { PUZZLE_PLAYBACK_CONFIG } from "../config/puzzlePlaybackConfig";
import type { ImportScanResult } from "../types/importTypes";
import {
  resolveNotationLineToStructuredMovesDetailed,
  type StructuredPlaybackMove,
} from "./resolveNotationLineToStructuredMoves";
import type {
  PuzzleScanPlaybackMeta,
  RuntimeAcceptedLine,
  RuntimeStructuredMove,
  RuntimeValidationBlock,
  ScanEvalBand,
} from "./runtimeValidationTypes";
import { interpretScanEvaluation } from "./scanEvalInterpretation";

type StepLike = {
  type?: string;
  stepType?: string;
  initialState?: { fen?: string; sideToMove?: "white" | "black" };
  validation?: Record<string, unknown>;
  sourceRef?: {
    nodeTimeline?: Array<{ notation?: string; fenAfter?: string }>;
  };
  puzzleMeta?: unknown;
  runtimeHints?: Record<string, string | number | boolean | null>;
};

type AuthoringExpectedMoveLike = {
  from?: number;
  to?: number;
  path?: number[];
  captures?: number[];
};

type AuthoringStepLike = {
  timeline?: Array<{
    type?: string;
    interaction?: {
      kind?: string;
      expectedSequence?: AuthoringExpectedMoveLike[];
    };
  }>;
};

function toRuntimeMove(m: StructuredPlaybackMove): RuntimeStructuredMove {
  return {
    notation: m.notation,
    from: m.from,
    to: m.to,
    path: m.path,
    captures: m.captures,
    resultFen: m.fenAfter,
  };
}

function resolveInitialFen(step: StepLike): string {
  return (step.initialState?.fen ?? "").trim();
}

function pickSequenceNotations(step: StepLike, moves: string[]): string[] {
  const timeline = step.sourceRef?.nodeTimeline ?? [];
  if (timeline.length === moves.length && moves.length > 0) {
    return moves.map((fallback, i) => {
      const n = timeline[i]?.notation;
      return typeof n === "string" && n.trim() ? n.trim() : fallback;
    });
  }
  return moves;
}

export function buildRuntimeValidationBlock(step: StepLike): {
  validation: RuntimeValidationBlock;
  puzzleScan?: PuzzleScanPlaybackMeta;
} {
  const initialFen = resolveInitialFen(step);
  return buildRuntimeValidationBlockWithAuthoring(step);
}

export function buildRuntimeValidationBlockWithAuthoring(
  step: StepLike,
  authoringStep?: AuthoringStepLike
): {
  validation: RuntimeValidationBlock;
  puzzleScan?: PuzzleScanPlaybackMeta;
} {
  const initialFen = resolveInitialFen(step);
  const validation = step.validation ?? {};
  const vType = typeof validation.type === "string" ? validation.type : "none";

  const puzzleSide: "white" | "black" =
    step.initialState?.sideToMove === "black" ? "black" : "white";

  const strictAuthoredOnly = computeStrictAuthoredOnly(step);
  const scanFallbackEnabled =
    computeScanFallbackEnabled(step) && !strictAuthoredOnly;
  const baseline = buildBaselineFromStep(step, puzzleSide);
  const puzzleScan: PuzzleScanPlaybackMeta = {
    scanFallbackEnabled,
    strictAuthoredOnly,
    puzzleSide,
    baseline,
    policy: {
      evalTolerance: PUZZLE_PLAYBACK_CONFIG.evalTolerance,
      winningThreshold: PUZZLE_PLAYBACK_CONFIG.winningThreshold,
      equalBandMax: PUZZLE_PLAYBACK_CONFIG.equalBandMax,
      scanDepth: PUZZLE_PLAYBACK_CONFIG.scanDepth,
      multiPv: PUZZLE_PLAYBACK_CONFIG.multiPv,
    },
    debug: buildScanDebugLines(step, scanFallbackEnabled),
  };

  if (vType === "none") {
    const authoringFallback = buildAuthoringAskSequenceFallback(initialFen, validation, authoringStep);
    if (authoringFallback) {
      return { validation: authoringFallback, puzzleScan };
    }
    return { validation: { runtimeKind: "none", acceptMode: "exact" }, puzzleScan };
  }

  if (vType === "goal") {
    return {
      validation: {
        runtimeKind: "goal",
        acceptMode: "exact",
        goalType: String(validation.goalType ?? "unknown"),
        targetSquare:
          typeof validation.targetSquare === "number" ? validation.targetSquare : undefined,
        sideToTest:
          validation.sideToTest === "white" || validation.sideToTest === "black"
            ? validation.sideToTest
            : undefined,
      },
      puzzleScan,
    };
  }

  if (vType === "sequence") {
    const rawMoves = Array.isArray(validation.moves)
      ? (validation.moves as unknown[]).map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];
    const notations = pickSequenceNotations(step, rawMoves);
    const moveSource =
      step.sourceRef?.nodeTimeline &&
      step.sourceRef.nodeTimeline.length === rawMoves.length
        ? "timeline_engine"
        : "notation_engine";

    const detailed = resolveNotationLineToStructuredMovesDetailed(initialFen, notations);
    if (!detailed.ok) {
      console.info(
        "[playback] sequence_line_unresolved",
        JSON.stringify({
          stepType: step.type,
          initialFen,
          authoringMoves: notations,
          debug: detailed.debug,
        })
      );
      return {
        validation: {
          runtimeKind: "authoring_only",
          acceptMode: "exact",
          authoring: {
            ...validation,
            _resolveError: "sequence_line_unresolved",
            _resolveDebug: detailed.debug,
          },
        },
        puzzleScan,
      };
    }

    const line: RuntimeAcceptedLine = {
      moves: detailed.moves.map(toRuntimeMove),
    };

    return {
      validation: {
        runtimeKind: "line",
        acceptMode: "exact",
        acceptedLines: [line],
        moveSource: moveSource === "timeline_engine" ? "timeline_engine" : "notation_engine",
      },
      puzzleScan,
    };
  }

  if (vType === "move") {
    const correct = Array.isArray(validation.correctMoves)
      ? (validation.correctMoves as unknown[]).map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];
    const lines: RuntimeAcceptedLine[] = [];
    for (const notation of correct) {
      const one = resolveNotationLineToStructuredMovesDetailed(initialFen, [notation]);
      if (!one.ok || one.moves.length !== 1) {
        console.info(
          "[playback] move_alternative_unresolved",
          JSON.stringify({
            stepType: step.type,
            initialFen,
            notation,
            debug: one.ok ? undefined : one.debug,
          })
        );
        return {
          validation: {
            runtimeKind: "authoring_only",
            acceptMode: "exact",
            authoring: {
              ...validation,
              _resolveError: "move_alternative_unresolved",
              _resolveDebug: one.ok ? undefined : one.debug,
            },
          },
          puzzleScan,
        };
      }
      lines.push({ moves: [toRuntimeMove(one.moves[0])] });
    }

    return {
      validation: {
        runtimeKind: "line",
        acceptMode: "exact",
        acceptedLines: lines,
        moveSource: "notation_engine",
      },
      puzzleScan,
    };
  }

  return {
    validation: {
      runtimeKind: "authoring_only",
      acceptMode: "exact",
      authoring: validation as Record<string, unknown>,
    },
    puzzleScan,
  };
}

function buildAuthoringAskSequenceFallback(
  initialFen: string,
  validation: Record<string, unknown>,
  authoringStep?: AuthoringStepLike
): RuntimeValidationBlock | null {
  const timeline = authoringStep?.timeline ?? [];
  const askSequence = timeline.find(
    (m) =>
      m?.type === "askSequence" &&
      m.interaction?.kind === "askSequence" &&
      Array.isArray(m.interaction.expectedSequence) &&
      m.interaction.expectedSequence.length > 0
  );
  const expected = askSequence?.interaction?.expectedSequence ?? [];
  if (!expected.length) return null;
  const notations = expected
    .map((mv) => {
      const from = Number(mv.from);
      const to = Number(mv.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
      const path = Array.isArray(mv.path) && mv.path.length >= 2 ? mv.path : [from, to];
      const isCapture = Array.isArray(mv.captures) && mv.captures.length > 0;
      return path.join(isCapture ? "x" : "-");
    })
    .filter(Boolean);
  if (!notations.length || !initialFen.trim()) {
    return null;
  }
  const detailed = resolveNotationLineToStructuredMovesDetailed(initialFen, notations);
  if (!detailed.ok) {
    return {
      runtimeKind: "authoring_only",
      acceptMode: "exact",
      authoring: {
        ...validation,
        _resolveError: "authoring_askSequence_line_unresolved",
        _resolveDebug: detailed.debug,
      },
    };
  }
  return {
    runtimeKind: "line",
    acceptMode: "exact",
    acceptedLines: [{ moves: detailed.moves.map(toRuntimeMove) }],
    moveSource: "timeline_engine",
  };
}

function hasPuzzleMeta(step: StepLike): boolean {
  const pm = step.puzzleMeta;
  return !!pm && typeof pm === "object";
}

export function computeStrictAuthoredOnly(step: StepLike): boolean {
  if (PUZZLE_PLAYBACK_CONFIG.requireExactForLessons && String(step.type ?? "") === "sequence") {
    return !hasPuzzleMeta(step);
  }
  return false;
}

function computeScanFallbackEnabled(step: StepLike): boolean {
  const stepType = String(step.type ?? "");
  if (PUZZLE_PLAYBACK_CONFIG.scanFallbackStepTypes.includes(stepType as "goal_challenge")) {
    return true;
  }
  if (PUZZLE_PLAYBACK_CONFIG.scanFallbackWhenPuzzleMetaPresent && hasPuzzleMeta(step)) {
    return true;
  }
  if (step.runtimeHints?.puzzleScanFallback === true) return true;
  if (step.runtimeHints?.puzzleScanFallback === false) return false;
  return false;
}

function buildScanDebugLines(step: StepLike, enabled: boolean): string[] {
  const lines: string[] = [];
  lines.push(`scan_fallback_enabled=${enabled}`);
  lines.push(`step_type=${String(step.type ?? "")}`);
  lines.push(`puzzle_meta=${hasPuzzleMeta(step)}`);
  return lines;
}

function buildBaselineFromStep(
  step: StepLike,
  puzzleSide: "white" | "black"
): { evaluationCp: number | null; band: ScanEvalBand; source: "stored" | "missing" } {
  const hints = step.runtimeHints ?? {};
  const raw =
    typeof hints.scanEvaluation === "number" && Number.isFinite(hints.scanEvaluation)
      ? hints.scanEvaluation
      : null;

  const scanLike: ImportScanResult = {
    evaluation: raw,
    bestMove: typeof hints.scanBestMove === "string" ? hints.scanBestMove : undefined,
    pv:
      typeof hints.scanPvLine === "string"
        ? hints.scanPvLine.split(/\s+/).filter(Boolean)
        : undefined,
  };

  if (raw === null) {
    return { evaluationCp: null, band: "unclear", source: "missing" };
  }

  const band = interpretScanEvaluation(scanLike.evaluation ?? null, puzzleSide, scanLike);

  return {
    evaluationCp: raw,
    band,
    source: "stored",
  };
}
