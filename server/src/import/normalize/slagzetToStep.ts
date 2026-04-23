import { randomUUID } from "crypto";
import type { ImportItem, ImportJob } from "../../types/importTypes";
import type { NormalizedCollectionItem } from "../adapters/types";
import { validateFenParseable } from "../../validation/semanticValidators";
import { inferPuzzleMeta } from "./inferPuzzleRating";
import { resolveNotationLineToStructuredMovesDetailed } from "../../playback/resolveNotationLineToStructuredMoves";

type LocalizedText = { values: Record<string, string> };

function toLocalized(en: string, nl: string): LocalizedText {
  return { values: { en, nl } };
}

function normalizeWhitespace(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function resolveFen(item: ImportItem, scrapedItem: NormalizedCollectionItem): string | null {
  const candidates = [scrapedItem.board50, item.board50, scrapedItem.sourceText, item.sourceText];
  for (const value of candidates) {
    const candidate = normalizeWhitespace(value);
    if (!candidate) continue;
    if (validateFenParseable(candidate).ok) return candidate;
  }
  return null;
}

function deriveSideToMove(fen: string): "white" | "black" {
  const first = fen.split(":")[0]?.trim().toUpperCase();
  return first === "B" ? "black" : "white";
}

function parseNotationPath(notation: string): number[] | null {
  const path = String(notation ?? "")
    .trim()
    .split(/[-x]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (path.length < 2) return null;
  for (const n of path) if (n < 1 || n > 50) return null;
  return path;
}

function notationToExpectedMoveSpec(notation: string): Record<string, unknown> | null {
  const cleaned = String(notation ?? "").trim();
  const path = parseNotationPath(cleaned);
  if (!path || path.length < 2) return null;
  if (!cleaned.includes("x") && path.length >= 3) {
    const [from, to, ...captures] = path;
    return captures.length > 0 ? { from, to, captures } : { from, to };
  }
  const from = path[0] as number;
  const to = path[path.length - 1] as number;
  const spec: Record<string, unknown> = { from, to };
  if (path.length > 2) spec.path = path;
  return spec;
}

function resolveExpectedSequence(fen: string, moves: string[]): Record<string, unknown>[] {
  if (!fen || moves.length === 0) return [];
  const detailed = resolveNotationLineToStructuredMovesDetailed(fen, moves);
  if (!detailed.ok || detailed.moves.length !== moves.length) {
    return moves
      .map((n) => notationToExpectedMoveSpec(n))
      .filter((s): s is Record<string, unknown> => !!s);
  }
  return detailed.moves.map((m) => ({
    from: m.from,
    to: m.to,
    path: m.path,
    captures: m.captures,
  }));
}

/**
 * Converts a scraped Slagzet item directly to an AuthoringLessonStep (v2).
 * No legacy intermediate format. Returns null if no valid move sequence can be derived.
 */
export function convertSlagzetItemToAuthoringStep(input: {
  job: ImportJob;
  item: ImportItem;
  scrapedItem: NormalizedCollectionItem;
  lessonId: string;
  orderIndex: number;
}): Record<string, unknown> | null {
  const { job, item, scrapedItem, lessonId, orderIndex } = input;

  const fen = resolveFen(item, scrapedItem);
  if (!fen) {
    throw new Error(`Unable to derive parseable FEN for import item ${item.itemId ?? item.id ?? ""}`);
  }

  const sideToMove = deriveSideToMove(fen);
  const stepId = randomUUID();
  const importedAt = new Date().toISOString();

  const sourceText = normalizeWhitespace(scrapedItem.sourceText ?? item.sourceText) || null;
  const resultText = normalizeWhitespace(scrapedItem.resultText ?? item.resultText) || null;
  const fragmentUrl = normalizeWhitespace(scrapedItem.fragmentUrl || item.fragmentUrl);

  const puzzleMeta = inferPuzzleMeta({
    collectionSlug: job.collectionSlug,
    collectionTitle: job.collectionTitle ?? null,
    baseDifficultyBand:
      job.baseDifficultyBand === "beginner" ||
      job.baseDifficultyBand === "intermediate" ||
      job.baseDifficultyBand === "advanced"
        ? job.baseDifficultyBand
        : null,
    basePuzzleRating:
      typeof job.basePuzzleRating === "number" && Number.isFinite(job.basePuzzleRating)
        ? job.basePuzzleRating
        : null,
    resultText,
    sourceText,
  });

  // Source text from Slagzet encodes the move sequence (space-separated notations)
  const rawMoves = sourceText
    ? sourceText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const expectedSequence = resolveExpectedSequence(fen, rawMoves);
  if (expectedSequence.length === 0) return null;

  const sourceId = `external:${job.sourceType}:${job.collectionSlug}`;

  const askMomentId = randomUUID();
  const askMoment: Record<string, unknown> = {
    id: askMomentId,
    type: "askSequence",
    body: toLocalized("", ""),
    interaction: {
      kind: "askSequence",
      requireExactOrder: true,
      allowRetry: true,
      maxAttempts: 1,
      expectedSequence,
      hintPlan: [
        { type: "path_pulse_stepwise", afterFailedAttempts: 1 },
        { type: "from", afterFailedAttempts: 2 },
        { type: "path_numbers", afterFailedAttempts: 3 },
        { type: "to", afterFailedAttempts: 4 },
        { type: "captures", afterFailedAttempts: 5 },
      ],
    },
  };

  return {
    id: stepId,
    stepId,
    lessonId,
    kind: "trySequence",
    orderIndex,
    title: toLocalized("Puzzle", "Puzzel"),
    initialState: {
      fen,
      sideToMove,
      variantId: "international",
    },
    sourceRef: { sourceId },
    tags: ["imported", "slagzet"],
    puzzleMeta,
    runtimeHints: {
      importSourceType: "slagzet",
      importCollectionSlug: job.collectionSlug,
      importFragmentUrl: fragmentUrl || null,
      importResultText: resultText,
      importSourceText: sourceText,
      importBaseDifficultyBand: job.baseDifficultyBand ?? null,
      importBasePuzzleRating: job.basePuzzleRating ?? null,
      puzzleRating: puzzleMeta.puzzleRating,
      puzzleDifficultyBand: puzzleMeta.difficultyBand,
      puzzleRatingSource: puzzleMeta.ratingSource,
    },
    metadata: {
      slagzetImport: {
        importedAt,
        snapshotFen: fen,
      },
    },
    timeline: [askMoment],
  };
}
