import type { ImportScanResult } from "../../types/importTypes";

export type DifficultyBand = "beginner" | "intermediate" | "advanced";
export type RatingSource = "collection-default" | "scan-heuristic" | "manual";

export type PuzzleMeta = {
  puzzleRating: number;
  difficultyBand: DifficultyBand;
  topicTags: string[];
  ratingSource: RatingSource;
};

export const BEGINNER_BASE_RATING = 800;
export const INTERMEDIATE_BASE_RATING = 1100;
export const ADVANCED_BASE_RATING = 1400;
export const MIN_PUZZLE_RATING = 400;
export const MAX_PUZZLE_RATING = 2400;
const MAX_SCAN_ADJUSTMENT = 150;

type InferInput = {
  collectionSlug?: string | null;
  collectionTitle?: string | null;
  baseDifficultyBand?: DifficultyBand | null;
  basePuzzleRating?: number | null;
  resultText?: string | null;
  sourceText?: string | null;
  scanResult?: ImportScanResult | null;
  combinationMoveCount?: number | null;
  starterSide?: "white" | "black" | null;
};

function normalizeText(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parsePvMoves(scanResult?: ImportScanResult | null): string[] {
  if (!scanResult || !Array.isArray(scanResult.pv)) return [];
  return scanResult.pv
    .map((m) => String(m ?? "").trim())
    .filter((m) => m.length > 0);
}

function isCaptureMove(move: string): boolean {
  return /x/i.test(move);
}

function countStarterQuietPrefixMovesFromPv(
  scanResult: ImportScanResult | null | undefined,
  starterSide?: "white" | "black" | null
): number {
  const moves = parsePvMoves(scanResult);
  if (moves.length === 0) return 0;
  const starter = starterSide === "black" ? "black" : "white";
  let side: "white" | "black" = starter;
  let quietStarterMoves = 0;

  for (const move of moves) {
    const capture = isCaptureMove(move);
    if (side === starter) {
      if (capture) break;
      quietStarterMoves += 1;
    }
    side = side === "white" ? "black" : "white";
  }
  return quietStarterMoves;
}

function isDifficultyBand(value: unknown): value is DifficultyBand {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

function isRatingSource(value: unknown): value is RatingSource {
  return (
    value === "collection-default" || value === "scan-heuristic" || value === "manual"
  );
}

function uniqueTags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function inferPuzzleDifficultyBand(input: InferInput): DifficultyBand {
  if (isDifficultyBand(input.baseDifficultyBand)) return input.baseDifficultyBand;
  const slug = normalizeText(input.collectionSlug);
  const title = normalizeText(input.collectionTitle);
  const text = `${slug} ${title}`;

  if (/(beginner|starter|novice|easy|basis)/i.test(text)) return "beginner";
  if (/(advanced|expert|master|pro|gevorderd)/i.test(text)) return "advanced";
  return "intermediate";
}

export function inferPuzzleRating(input: InferInput): number {
  const band = inferPuzzleDifficultyBand(input);
  const defaultBase =
    band === "beginner"
      ? BEGINNER_BASE_RATING
      : band === "advanced"
      ? ADVANCED_BASE_RATING
      : INTERMEDIATE_BASE_RATING;
  const base =
    typeof input.basePuzzleRating === "number" && Number.isFinite(input.basePuzzleRating)
      ? clamp(Math.round(input.basePuzzleRating), MIN_PUZZLE_RATING, MAX_PUZZLE_RATING)
      : defaultBase;

  const moveCount = Number(input.combinationMoveCount ?? 0);
  const hasScan = !!input.scanResult;
  if (!hasScan) return clamp(base, MIN_PUZZLE_RATING, MAX_PUZZLE_RATING);

  let adjust = 0;
  if (Number.isFinite(moveCount) && moveCount > 0) {
    // Longer forcing lines are usually a bit harder.
    adjust += clamp((moveCount - 2) * 20, 0, 100);
  }

  const evalCp = Number(input.scanResult?.evaluation ?? 0);
  if (Number.isFinite(evalCp) && Math.abs(evalCp) >= 8 && moveCount <= 2) {
    // Very large eval with short line often indicates a trivial tactic.
    adjust -= 60;
  }

  const starterQuietPrefixCount = countStarterQuietPrefixMovesFromPv(
    input.scanResult,
    input.starterSide
  );
  if (starterQuietPrefixCount > 0) {
    // More preparatory quiet starter moves generally means harder discovery.
    adjust += clamp(starterQuietPrefixCount * 25, 0, 100);
  }

  adjust = clamp(adjust, -MAX_SCAN_ADJUSTMENT, MAX_SCAN_ADJUSTMENT);
  return clamp(Math.round(base + adjust), MIN_PUZZLE_RATING, MAX_PUZZLE_RATING);
}

export function inferPuzzleTags(input: InferInput): string[] {
  const tags = ["puzzle"];
  const band = inferPuzzleDifficultyBand(input);
  tags.push(band);

  const slugTag = normalizeTag(input.collectionSlug ?? "");
  if (slugTag) tags.push(slugTag);

  const resultText = normalizeText(input.resultText);
  if (/(win|wins|wint|winst)/i.test(resultText)) tags.push("win");

  const sourceText = normalizeText(input.sourceText);
  if (/(endgame|eindspel)/i.test(sourceText)) tags.push("endgame");
  if (/(combination|combinatie|slagzet)/i.test(`${sourceText} ${slugTag}`)) {
    tags.push("combination");
  }

  return uniqueTags(tags);
}

export function inferPuzzleMeta(input: InferInput): PuzzleMeta {
  const hasScan = !!input.scanResult;
  return {
    puzzleRating: inferPuzzleRating(input),
    difficultyBand: inferPuzzleDifficultyBand(input),
    topicTags: inferPuzzleTags(input),
    ratingSource: hasScan ? "scan-heuristic" : "collection-default",
  };
}

export function mergePuzzleMeta(
  existing: unknown,
  inferred: PuzzleMeta
): PuzzleMeta {
  if (!existing || typeof existing !== "object") return inferred;
  const maybe = existing as Partial<PuzzleMeta>;
  if (maybe.ratingSource === "manual") {
    return {
      puzzleRating:
        typeof maybe.puzzleRating === "number" && Number.isFinite(maybe.puzzleRating)
          ? Math.round(maybe.puzzleRating)
          : inferred.puzzleRating,
      difficultyBand: isDifficultyBand(maybe.difficultyBand)
        ? maybe.difficultyBand
        : inferred.difficultyBand,
      topicTags:
        Array.isArray(maybe.topicTags) && maybe.topicTags.length > 0
          ? uniqueTags(maybe.topicTags.map((v) => String(v)))
          : inferred.topicTags,
      ratingSource: "manual",
    };
  }

  const mergedTags = uniqueTags([
    ...inferred.topicTags,
    ...(Array.isArray(maybe.topicTags) ? maybe.topicTags.map((v) => String(v)) : []),
  ]);

  return {
    puzzleRating:
      typeof maybe.puzzleRating === "number" && Number.isFinite(maybe.puzzleRating)
        ? Math.round(maybe.puzzleRating)
        : inferred.puzzleRating,
    difficultyBand: isDifficultyBand(maybe.difficultyBand)
      ? maybe.difficultyBand
      : inferred.difficultyBand,
    topicTags: mergedTags.length > 0 ? mergedTags : inferred.topicTags,
    ratingSource: isRatingSource(maybe.ratingSource)
      ? maybe.ratingSource
      : inferred.ratingSource,
  };
}
