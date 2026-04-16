import { PUZZLE_PLAYBACK_CONFIG } from "../config/puzzlePlaybackConfig";
import { runImportScanAnalysis } from "../engine/importScan/runImportScanAnalysis";
import type { ImportScanResult } from "../types/importTypes";
import {
  evaluatePuzzleMoveFallbackCore,
  type EvaluatePuzzleMoveFallbackCoreInput,
  type EvaluatePuzzleMoveFallbackCoreResult,
} from "./evaluatePuzzleMoveFallbackCore";

export type EvaluatePuzzleMoveFallbackServerInput = Omit<
  EvaluatePuzzleMoveFallbackCoreInput,
  "scanResult"
> & {
  variantId: string;
  /** When false, caller must pass scanResult manually (not implemented here). */
  runScan?: boolean;
};

/**
 * Server-side helper: runs Scan on `resultingFen` then applies conservative fallback policy.
 */
export async function evaluatePuzzleMoveFallback(
  input: EvaluatePuzzleMoveFallbackServerInput
): Promise<EvaluatePuzzleMoveFallbackCoreResult> {
  const runScan = input.runScan !== false;
  let scanResult: ImportScanResult | null = null;

  if (runScan) {
    try {
      scanResult = await runImportScanAnalysis({
        variantId: input.variantId,
        fen: input.resultingFen,
        depth: input.policy?.scanDepth ?? PUZZLE_PLAYBACK_CONFIG.scanDepth,
        multiPv: input.policy?.multiPv ?? PUZZLE_PLAYBACK_CONFIG.multiPv,
      });
    } catch {
      scanResult = null;
    }
  }

  return evaluatePuzzleMoveFallbackCore({
    ...input,
    scanResult,
  });
}
