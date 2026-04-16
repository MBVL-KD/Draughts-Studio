import { PUZZLE_PLAYBACK_CONFIG } from "../config/puzzlePlaybackConfig";
import type { ImportScanResult } from "../types/importTypes";
import type { ScanEvalBand } from "./runtimeValidationTypes";

/**
 * Normalize Scan evaluation to the puzzle player's side (starter color).
 * Assumes engine `evaluation` is from the perspective of the side to move in the analyzed FEN.
 */
export function evaluationForPuzzleSide(params: {
  evaluation: number;
  /** Side to move in the FEN that was analyzed */
  fenSideToMove: "white" | "black";
  puzzleSide: "white" | "black";
}): number {
  const { evaluation, fenSideToMove, puzzleSide } = params;
  if (fenSideToMove === puzzleSide) return evaluation;
  return -evaluation;
}

/**
 * Map a numeric engine evaluation (side-to-move perspective) into coarse bands for the puzzle side.
 */
export function interpretScanEvaluation(
  evaluation: number | null | undefined,
  _puzzleSide: "white" | "black",
  scan?: Pick<ImportScanResult, "evaluation"> | null
): ScanEvalBand {
  const raw = evaluation ?? scan?.evaluation ?? null;
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
    return "unclear";
  }

  const v = Number(raw);
  const thr = PUZZLE_PLAYBACK_CONFIG.winningThreshold;
  const eq = PUZZLE_PLAYBACK_CONFIG.equalBandMax;

  if (v > thr) return "winning";
  if (v > eq) return "large_advantage";
  if (v >= -eq) return "equal";
  if (v >= -thr) return "unclear";
  return "losing";
}

/**
 * Compare two evaluations (same perspective) with tolerance — used for Scan fallback acceptance.
 */
export function evalWithinTolerance(
  baseline: number,
  candidate: number,
  tolerance: number = PUZZLE_PLAYBACK_CONFIG.evalTolerance
): boolean {
  return candidate >= baseline - tolerance;
}
