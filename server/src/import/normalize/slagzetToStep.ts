import { randomUUID } from "crypto";
import type { ImportItem, ImportJob } from "../../types/importTypes";
import type { NormalizedCollectionItem } from "../adapters/types";
import { validateFenParseable } from "../../validation/semanticValidators";
import { inferPuzzleMeta } from "./inferPuzzleRating";

type LocalizedText = {
  values: Record<string, string>;
};

type ImportStepLike = {
  id: string;
  stepId: string;
  type: string;
  title: LocalizedText;
  prompt: LocalizedText;
  hint: LocalizedText;
  explanation: LocalizedText;
  initialState: {
    fen: string;
    sideToMove: "white" | "black";
  };
  sourceRef: {
    sourceId: string;
    lineMode: "custom";
    importedAt: string;
    snapshotFen: string;
  };
  presentation: Record<string, unknown>;
  validation: Record<string, unknown>;
  feedback: Record<string, unknown>;
  tags: string[];
  puzzleMeta: {
    puzzleRating: number;
    difficultyBand: "beginner" | "intermediate" | "advanced";
    topicTags: string[];
    ratingSource: "collection-default" | "scan-heuristic" | "manual";
  };
  runtimeHints: Record<string, string | number | boolean | null>;
  orderIndex?: number;
};

function toLocalized(en: string, nl: string): LocalizedText {
  return {
    values: {
      en,
      nl,
    },
  };
}

function normalizeWhitespace(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function resolveTitle(item: ImportItem, scrapedItem: NormalizedCollectionItem): LocalizedText {
  return toLocalized("Puzzle", "Puzzle");
}

function resolvePrompt(item: ImportItem, scrapedItem: NormalizedCollectionItem): LocalizedText {
  const resultText = normalizeWhitespace(scrapedItem.resultText ?? item.resultText);
  if (resultText) {
    return toLocalized(
      `Find the winning continuation (${resultText}).`,
      `Vind de winnende voortzetting (${resultText}).`
    );
  }
  return toLocalized(
    "Find the winning continuation.",
    "Vind de winnende voortzetting."
  );
}

function resolveFenCandidate(item: ImportItem, scrapedItem: NormalizedCollectionItem): string | null {
  const candidates = [
    scrapedItem.board50,
    item.board50,
    scrapedItem.sourceText,
    item.sourceText,
  ];

  for (const value of candidates) {
    const candidate = normalizeWhitespace(value);
    if (!candidate) continue;
    const validation = validateFenParseable(candidate);
    if (validation.ok) return candidate;
  }
  return null;
}

function deriveSideToMove(fen: string): "white" | "black" {
  const first = fen.split(":")[0]?.trim().toUpperCase();
  return first === "B" ? "black" : "white";
}

export function convertSlagzetItemToLessonStep(input: {
  job: ImportJob;
  item: ImportItem;
  scrapedItem: NormalizedCollectionItem;
}): ImportStepLike {
  const { job, item, scrapedItem } = input;
  const stepId = randomUUID();
  const fen = resolveFenCandidate(item, scrapedItem);
  if (!fen) {
    throw new Error(
      `Unable to derive parseable FEN for import item ${item.itemId ?? item.id ?? ""}`
    );
  }

  const sourceId = `external:${job.sourceType}:${job.collectionSlug}`;
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

  return {
    id: stepId,
    stepId,
    type: "sequence",
    title: resolveTitle(item, scrapedItem),
    prompt: resolvePrompt(item, scrapedItem),
    hint: toLocalized("", ""),
    explanation: toLocalized("", ""),
    initialState: {
      fen,
      sideToMove: deriveSideToMove(fen),
    },
    sourceRef: {
      sourceId,
      lineMode: "custom",
      importedAt,
      snapshotFen: fen,
    },
    presentation: {
      highlights: [],
      arrows: [],
      routes: [],
      animations: [],
      npc: {
        npcId: "",
        text: { values: { en: "", nl: "" } },
        mode: "bubble",
      },
      autoplay: {
        moves: [],
        moveDurationMs: 900,
        startDelayMs: 300,
        autoPlayOnStepOpen: false,
      },
    },
    validation: {
      type: "sequence",
      moves: [],
      allowBranches: false,
    },
    feedback: {
      correct: { values: { en: "Correct.", nl: "Goed." } },
      incorrect: { values: { en: "Try again.", nl: "Probeer opnieuw." } },
    },
    tags: ["imported", "slagzet"],
    puzzleMeta,
    runtimeHints: {
      importSourceType: "slagzet",
      importCollectionSlug: job.collectionSlug,
      importFragmentUrl: fragmentUrl || null,
      importResultText: resultText,
      importSourceText: sourceText,
      importBaseDifficultyBand:
        job.baseDifficultyBand === "beginner" ||
        job.baseDifficultyBand === "intermediate" ||
        job.baseDifficultyBand === "advanced"
          ? job.baseDifficultyBand
          : null,
      importBasePuzzleRating:
        typeof job.basePuzzleRating === "number" && Number.isFinite(job.basePuzzleRating)
          ? job.basePuzzleRating
          : null,
      puzzleRating: puzzleMeta.puzzleRating,
      puzzleDifficultyBand: puzzleMeta.difficultyBand,
      puzzleRatingSource: puzzleMeta.ratingSource,
    },
  };
}
