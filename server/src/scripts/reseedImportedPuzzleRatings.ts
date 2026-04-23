import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { inferPuzzleMeta } from "../import/normalize/inferPuzzleRating";

function readRuntimeHint(step: Record<string, any>, key: string): unknown {
  const hints = step?.runtimeHints;
  if (!hints) return undefined;
  if (typeof hints.get === "function") return hints.get(key);
  return hints[key];
}

function parseMoveCountFromStep(step: Record<string, any>): number {
  const validationMoves = Array.isArray(step?.validation?.moves)
    ? step.validation.moves.filter((m: unknown) => typeof m === "string" && String(m).trim())
    : [];
  if (validationMoves.length > 0) return validationMoves.length;

  const scanPvMovesRaw = readRuntimeHint(step, "scanPvMoves");
  if (typeof scanPvMovesRaw === "string" && scanPvMovesRaw.trim()) {
    const parts = scanPvMovesRaw.split("|").map((m: string) => m.trim()).filter(Boolean);
    if (parts.length > 0) return parts.length;
  }
  return 0;
}

function parseScanResultFromStep(step: Record<string, any>) {
  const evaluation = Number(readRuntimeHint(step, "scanEvaluation"));
  const bestMoveRaw = readRuntimeHint(step, "scanBestMove");
  const bestMove = typeof bestMoveRaw === "string" ? bestMoveRaw : undefined;
  const pvLineRaw = readRuntimeHint(step, "scanPvLine");
  const pvRaw = typeof pvLineRaw === "string" ? pvLineRaw : "";
  const pv = pvRaw
    .split(/\s+/)
    .map((m: string) => m.trim())
    .filter(Boolean);
  if (!Number.isFinite(evaluation) && !bestMove && pv.length === 0) return null;
  return {
    evaluation: Number.isFinite(evaluation) ? evaluation : null,
    bestMove,
    pv: pv.length > 0 ? pv : undefined,
  };
}

async function main() {
  await connectMongo(process.env.MONGO_URI ?? "");
  const books = await BookModel.find({
    isDeleted: false,
    tags: { $in: ["puzzels-import"] },
  });

  let touchedBooks = 0;
  let touchedSteps = 0;

  for (const book of books) {
    let bookChanged = false;
    const lessons = Array.isArray(book.lessons) ? [...book.lessons] : [];

    for (let li = 0; li < lessons.length; li += 1) {
      const lesson: any = lessons[li] ?? {};
      const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
      let lessonChanged = false;

      for (let si = 0; si < steps.length; si += 1) {
        const step: any = steps[si] ?? {};
        const runtimeHints = step.runtimeHints && typeof step.runtimeHints === "object"
          ? typeof step.runtimeHints.toObject === "function"
            ? step.runtimeHints.toObject()
            : { ...step.runtimeHints }
          : {};
        const moveCount = parseMoveCountFromStep(step);
        const scanResult = parseScanResultFromStep(step);
        const inferred = inferPuzzleMeta({
          collectionSlug:
            typeof runtimeHints.importCollectionSlug === "string"
              ? runtimeHints.importCollectionSlug
              : null,
          baseDifficultyBand:
            runtimeHints.importBaseDifficultyBand === "beginner" ||
            runtimeHints.importBaseDifficultyBand === "intermediate" ||
            runtimeHints.importBaseDifficultyBand === "advanced"
              ? runtimeHints.importBaseDifficultyBand
              : null,
          basePuzzleRating:
            typeof runtimeHints.importBasePuzzleRating === "number" &&
            Number.isFinite(runtimeHints.importBasePuzzleRating)
              ? runtimeHints.importBasePuzzleRating
              : null,
          resultText:
            typeof runtimeHints.importResultText === "string"
              ? runtimeHints.importResultText
              : null,
          sourceText:
            typeof runtimeHints.importSourceText === "string"
              ? runtimeHints.importSourceText
              : null,
          scanResult,
          combinationMoveCount: moveCount,
          starterSide: step?.initialState?.sideToMove === "black" ? "black" : "white",
        });

        const beforeRating = Number(step?.puzzleMeta?.puzzleRating);
        const beforeBand = String(step?.puzzleMeta?.difficultyBand ?? "");
        if (
          beforeRating === inferred.puzzleRating &&
          beforeBand === inferred.difficultyBand
        ) {
          continue;
        }

        step.puzzleMeta = inferred;
        step.runtimeHints = {
          ...runtimeHints,
          puzzleRating: inferred.puzzleRating,
          puzzleDifficultyBand: inferred.difficultyBand,
          puzzleRatingSource: inferred.ratingSource,
          puzzleTags: inferred.topicTags.join("|") || null,
        };
        steps[si] = step;
        lessonChanged = true;
        touchedSteps += 1;
      }

      if (lessonChanged) {
        lessons[li] = { ...lesson, steps };
        bookChanged = true;
      }
    }

    if (bookChanged) {
      book.lessons = lessons as any;
      await book.save();
      touchedBooks += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedBooks: books.length,
        updatedBooks: touchedBooks,
        updatedSteps: touchedSteps,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[reseed-imported-puzzle-ratings] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
