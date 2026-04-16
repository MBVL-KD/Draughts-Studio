import type { RuntimeStructuredMove, RuntimeValidationLineBlock } from "./runtimeValidationTypes";
import { movesEqual, type PlayedMoveLike } from "./movesEqual";
import {
  evaluatePuzzleMoveFallbackCore,
  type EvaluatePuzzleMoveFallbackCoreInput,
  type PuzzleMoveFallbackReason,
} from "./evaluatePuzzleMoveFallbackCore";
import type { ImportScanResult } from "../types/importTypes";

export type ExactMatchResult = {
  ok: boolean;
  reason: PuzzleMoveFallbackReason | "exact_authored_match" | "no_matching_line";
};

/**
 * Find whether the played move matches any accepted authored line at the given ply (0-based).
 */
export function matchAuthoredStructuredMove(params: {
  validation: RuntimeValidationLineBlock;
  plyIndex: number;
  played: PlayedMoveLike;
}): ExactMatchResult {
  const { validation, plyIndex, played } = params;
  const expected = validation.acceptedLines
    .map((line) => line.moves[plyIndex])
    .filter((m): m is RuntimeStructuredMove => !!m);

  if (expected.length === 0) {
    return { ok: false, reason: "no_matching_line" };
  }

  const structured: RuntimeStructuredMove = {
    notation: "",
    from: played.from,
    to: played.to,
    path: played.path,
    captures: played.captures,
    resultFen: "",
  };

  for (const candidate of expected) {
    if (movesEqual(candidate, structured)) {
      return { ok: true, reason: "exact_authored_match" };
    }
  }

  return { ok: false, reason: "no_matching_line" };
}

export type ValidateRuntimeMoveResult = {
  accepted: boolean;
  reason: PuzzleMoveFallbackReason | "exact_authored_match" | "no_matching_line";
  usedFallback: boolean;
};

/**
 * Orchestrates exact-first, Scan-fallback-second for one ply (Roblox can port this file verbatim).
 */
export function validateRuntimeMoveWithOptionalScanFallback(params: {
  validation: RuntimeValidationLineBlock;
  plyIndex: number;
  played: PlayedMoveLike;
  fallbackInput: Omit<EvaluatePuzzleMoveFallbackCoreInput, "scanResult">;
  scanResult: ImportScanResult | null;
}): ValidateRuntimeMoveResult {
  const exact = matchAuthoredStructuredMove({
    validation: params.validation,
    plyIndex: params.plyIndex,
    played: params.played,
  });

  if (exact.ok) {
    return {
      accepted: true,
      reason: "exact_authored_match",
      usedFallback: false,
    };
  }

  if (params.fallbackInput.strictAuthoredOnly) {
    return {
      accepted: false,
      reason: "lesson_strict_no_fallback",
      usedFallback: false,
    };
  }

  if (!params.fallbackInput.scanFallbackEnabled) {
    return {
      accepted: false,
      reason: "scan_fallback_disabled",
      usedFallback: false,
    };
  }

  const fb = evaluatePuzzleMoveFallbackCore({
    ...params.fallbackInput,
    scanResult: params.scanResult,
  });

  return {
    accepted: fb.accepted,
    reason: fb.reason,
    usedFallback: fb.accepted,
  };
}
