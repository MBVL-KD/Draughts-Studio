import type { ImportScanResult } from "../../types/importTypes";
import { trimPvToCombinationWindow } from "./parsePvMoves";
import { inferPuzzleMeta, mergePuzzleMeta } from "./inferPuzzleRating";
import { resolveNotationLineToStructuredMovesDetailed } from "../../playback/resolveNotationLineToStructuredMoves";

function canonicalizeScanMoves(initialFen: string, moves: string[]): Record<string, unknown>[] {
  const fen = String(initialFen ?? "").trim();
  if (!fen || moves.length === 0) return [];
  const detailed = resolveNotationLineToStructuredMovesDetailed(fen, moves);
  if (!detailed.ok || detailed.moves.length !== moves.length) return [];
  return detailed.moves.map((m) => ({ from: m.from, to: m.to, path: m.path, captures: m.captures }));
}

/**
 * Applies engine scan results to a v2 AuthoringLessonStep.
 * Updates: expectedSequence in the askSequence moment, puzzleMeta, runtimeHints.
 */
export function applyScanResultToImportedStep(
  step: Record<string, unknown>,
  scan: ImportScanResult
): Record<string, unknown> {
  const initialState = step.initialState as Record<string, unknown> | undefined;
  const fen = String(initialState?.fen ?? "").trim();
  const sideToMove = initialState?.sideToMove === "black" ? "black" : "white";

  const truncatedMoves = trimPvToCombinationWindow(scan.pv, sideToMove);
  const resolvedSequence = canonicalizeScanMoves(fen, truncatedMoves);

  const puzzleMeta = mergePuzzleMeta(
    step.puzzleMeta,
    inferPuzzleMeta({
      collectionSlug:
        typeof (step.runtimeHints as Record<string, unknown> | undefined)?.importCollectionSlug === "string"
          ? (step.runtimeHints as Record<string, unknown>).importCollectionSlug as string
          : null,
      resultText:
        typeof (step.runtimeHints as Record<string, unknown> | undefined)?.importResultText === "string"
          ? (step.runtimeHints as Record<string, unknown>).importResultText as string
          : null,
      sourceText:
        typeof (step.runtimeHints as Record<string, unknown> | undefined)?.importSourceText === "string"
          ? (step.runtimeHints as Record<string, unknown>).importSourceText as string
          : null,
      baseDifficultyBand: (() => {
        const v = (step.runtimeHints as Record<string, unknown> | undefined)?.importBaseDifficultyBand;
        return v === "beginner" || v === "intermediate" || v === "advanced" ? v : null;
      })(),
      basePuzzleRating: (() => {
        const v = (step.runtimeHints as Record<string, unknown> | undefined)?.importBasePuzzleRating;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      })(),
      scanResult: scan,
      combinationMoveCount: resolvedSequence.length,
      starterSide: sideToMove,
    })
  );

  // Update expectedSequence inside the askSequence moment in the timeline
  const timeline = Array.isArray(step.timeline)
    ? step.timeline.map((moment: unknown) => {
        const m = moment as Record<string, unknown>;
        if (m?.type !== "askSequence") return m;
        const interaction = m.interaction as Record<string, unknown> | undefined;
        if (!interaction || interaction.kind !== "askSequence") return m;
        if (resolvedSequence.length === 0) return m;
        return {
          ...m,
          interaction: { ...interaction, expectedSequence: resolvedSequence },
        };
      })
    : [];

  return {
    ...step,
    timeline,
    puzzleMeta,
    runtimeHints: {
      ...(step.runtimeHints as Record<string, unknown> | undefined),
      scanBestMove: scan.bestMove ?? null,
      scanPonder: scan.ponder ?? null,
      scanEvaluation: scan.evaluation ?? null,
      scanDepth: scan.depthUsed ?? null,
      scanPvMoves: truncatedMoves.join("|") || null,
      puzzleRating: puzzleMeta.puzzleRating,
      puzzleDifficultyBand: puzzleMeta.difficultyBand,
      puzzleRatingSource: puzzleMeta.ratingSource,
      puzzleTags: puzzleMeta.topicTags.join("|") || null,
    },
  };
}
