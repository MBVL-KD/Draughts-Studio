import type { ImportScanResult } from "../../types/importTypes";
import { trimPvToCombinationWindow } from "./parsePvMoves";
import { inferPuzzleMeta, mergePuzzleMeta } from "./inferPuzzleRating";
import { resolveNotationLineToStructuredMovesDetailed } from "../../playback/resolveNotationLineToStructuredMoves";

type LocalizedText = {
  values: Record<string, string>;
};

type StepLike = {
  type?: string;
  hint: LocalizedText;
  explanation?: LocalizedText;
  presentation: Record<string, unknown>;
  validation: Record<string, unknown>;
  runtimeHints: Record<string, string | number | boolean | null>;
  initialState: { fen: string; sideToMove: "white" | "black" };
  feedback?: Record<string, unknown>;
  puzzleMeta?: unknown;
};

function formatEngineHint(scan: ImportScanResult, moves: string[]): string {
  const best = String(scan.bestMove ?? "").trim();
  if (best) return best;
  return moves[0] ?? "";
}

function canonicalizeScanMoves(initialFen: string, moves: string[]): string[] {
  const fen = String(initialFen ?? "").trim();
  if (!fen || moves.length === 0) return moves;
  const detailed = resolveNotationLineToStructuredMovesDetailed(fen, moves);
  if (!detailed.ok) return moves;
  return detailed.moves.map((m) => m.notation);
}

export function applyScanResultToImportedStep<T extends StepLike>(
  step: T,
  scan: ImportScanResult
): T {
  const starter = step.initialState?.sideToMove === "black" ? "black" : "white";
  const truncatedMoves = trimPvToCombinationWindow(scan.pv, starter);
  const moves = canonicalizeScanMoves(step.initialState?.fen ?? "", truncatedMoves);
  const hintText = formatEngineHint(scan, moves);

  const basePresentation =
    step.presentation && typeof step.presentation === "object"
      ? step.presentation
      : {};
  const puzzleMeta = mergePuzzleMeta(
    step.puzzleMeta,
    inferPuzzleMeta({
      collectionSlug:
        typeof step.runtimeHints?.importCollectionSlug === "string"
          ? step.runtimeHints.importCollectionSlug
          : null,
      resultText:
        typeof step.runtimeHints?.importResultText === "string"
          ? step.runtimeHints.importResultText
          : null,
      sourceText:
        typeof step.runtimeHints?.importSourceText === "string"
          ? step.runtimeHints.importSourceText
          : null,
      baseDifficultyBand:
        step.runtimeHints?.importBaseDifficultyBand === "beginner" ||
        step.runtimeHints?.importBaseDifficultyBand === "intermediate" ||
        step.runtimeHints?.importBaseDifficultyBand === "advanced"
          ? step.runtimeHints.importBaseDifficultyBand
          : null,
      basePuzzleRating:
        typeof step.runtimeHints?.importBasePuzzleRating === "number" &&
        Number.isFinite(step.runtimeHints.importBasePuzzleRating)
          ? step.runtimeHints.importBasePuzzleRating
          : null,
      scanResult: scan,
      combinationMoveCount: moves.length,
      starterSide: step.initialState?.sideToMove ?? "white",
    })
  );

  return {
    ...step,
    type: "sequence",
    hint: {
      values: {
        en: hintText,
        nl: hintText,
      },
    },
    presentation: {
      ...basePresentation,
      highlights: Array.isArray((basePresentation as { highlights?: unknown }).highlights)
        ? (basePresentation as { highlights: unknown[] }).highlights
        : [],
      arrows: Array.isArray((basePresentation as { arrows?: unknown }).arrows)
        ? (basePresentation as { arrows: unknown[] }).arrows
        : [],
      routes: Array.isArray((basePresentation as { routes?: unknown }).routes)
        ? (basePresentation as { routes: unknown[] }).routes
        : [],
      animations: Array.isArray((basePresentation as { animations?: unknown }).animations)
        ? (basePresentation as { animations: unknown[] }).animations
        : [],
      npc:
        (basePresentation as { npc?: Record<string, unknown> }).npc ?? {
          npcId: "",
          text: { values: { en: "", nl: "" } },
          mode: "bubble",
        },
      autoplay: {
        moves,
        moveDurationMs: 900,
        startDelayMs: 300,
        autoPlayOnStepOpen: false,
      },
    },
    validation: {
      type: "sequence",
      moves,
      allowBranches: false,
    },
    puzzleMeta,
    runtimeHints: {
      ...step.runtimeHints,
      scanBestMove: scan.bestMove ?? null,
      scanPonder: scan.ponder ?? null,
      scanEvaluation: scan.evaluation ?? null,
      scanPvLine: moves.join(" ") || null,
      scanDepth: scan.depthUsed ?? null,
      scanPvMoves: moves.join("|") || null,
      puzzleRating: puzzleMeta.puzzleRating,
      puzzleDifficultyBand: puzzleMeta.difficultyBand,
      puzzleRatingSource: puzzleMeta.ratingSource,
      puzzleTags: puzzleMeta.topicTags.join("|") || null,
    },
  } as T;
}
