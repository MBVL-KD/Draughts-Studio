const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function inferBand(step) {
  const hints = step?.runtimeHints ?? {};
  const hintBand = hints.importBaseDifficultyBand;
  if (hintBand === "beginner" || hintBand === "intermediate" || hintBand === "advanced") {
    return hintBand;
  }
  const slug = normalizeText(hints.importCollectionSlug);
  if (slug.includes("beginner") || slug.includes("starter") || slug.includes("easy")) {
    return "beginner";
  }
  const existingBand = step?.puzzleMeta?.difficultyBand;
  if (existingBand === "beginner" || existingBand === "intermediate" || existingBand === "advanced") {
    return existingBand;
  }
  return "intermediate";
}

function parseMoveCount(step) {
  const fromValidation = Array.isArray(step?.validation?.moves)
    ? step.validation.moves.filter((m) => typeof m === "string" && m.trim()).length
    : 0;
  if (fromValidation > 0) return fromValidation;
  const pvMovesRaw = step?.runtimeHints?.scanPvMoves;
  if (typeof pvMovesRaw === "string" && pvMovesRaw.trim()) {
    return pvMovesRaw.split("|").map((m) => m.trim()).filter(Boolean).length;
  }
  return 0;
}

function beginnerSeed(moveCount) {
  if (moveCount <= 2) return 800;
  if (moveCount <= 4) return 900;
  return 1000;
}

function inferRating(step) {
  const band = inferBand(step);
  const moveCount = parseMoveCount(step);
  if (band === "beginner") return beginnerSeed(moveCount);
  if (band === "advanced") return 1400;
  return 1100;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const books = await db
    .collection("books")
    .find({ isDeleted: { $ne: true }, tags: { $in: ["puzzels-import"] } })
    .toArray();

  let touchedBooks = 0;
  let touchedSteps = 0;

  for (const book of books) {
    const lessons = Array.isArray(book.lessons) ? [...book.lessons] : [];
    let bookChanged = false;

    for (let li = 0; li < lessons.length; li += 1) {
      const lesson = lessons[li];
      const steps = Array.isArray(lesson?.steps) ? [...lesson.steps] : [];
      let lessonChanged = false;

      for (let si = 0; si < steps.length; si += 1) {
        const step = steps[si];
        if (!step || typeof step !== "object") continue;
        const rating = inferRating(step);
        const band = inferBand(step);
        const before = Number(step?.puzzleMeta?.puzzleRating);
        if (before === rating && step?.puzzleMeta?.difficultyBand === band) continue;

        const nextStep = {
          ...step,
          puzzleMeta: {
            ...(step.puzzleMeta ?? {}),
            puzzleRating: rating,
            difficultyBand: band,
            ratingSource: "scan-heuristic",
          },
          runtimeHints: {
            ...(step.runtimeHints ?? {}),
            puzzleRating: rating,
            puzzleDifficultyBand: band,
            puzzleRatingSource: "scan-heuristic",
          },
        };
        steps[si] = nextStep;
        lessonChanged = true;
        touchedSteps += 1;
      }

      if (lessonChanged) {
        lessons[li] = { ...lesson, steps };
        bookChanged = true;
      }
    }

    if (bookChanged) {
      await db
        .collection("books")
        .updateOne({ _id: book._id }, { $set: { lessons, updatedAt: new Date() } });
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
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("[reseed-imported-puzzle-ratings-js] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
