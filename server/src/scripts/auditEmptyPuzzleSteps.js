const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

function analyzeAuthoringStep(step) {
  const reasons = [];
  const timeline = Array.isArray(step.timeline) ? step.timeline : [];

  const hasAskSequenceMoment = timeline.some((m) => m && m.type === "askSequence");
  const hasAskMoveMoment = timeline.some((m) => m && m.type === "askMove");

  const hasFilledAskSequence = timeline.some((m) => {
    if (!m || m.type !== "askSequence") return false;
    const ix = m.interaction;
    if (!ix || ix.kind !== "askSequence") return false;
    const seq = ix.expectedSequence;
    return Array.isArray(seq) && seq.length > 0;
  });

  const hasFilledAskMove = timeline.some((m) => {
    if (!m || m.type !== "askMove") return false;
    const ix = m.interaction;
    if (!ix || ix.kind !== "askMove") return false;
    const em = ix.expectedMoves;
    return Array.isArray(em) && em.length > 0;
  });

  if (hasAskSequenceMoment && !hasFilledAskSequence) {
    reasons.push("askSequence moment(s) but no non-empty expectedSequence");
  }
  if (hasAskMoveMoment && !hasFilledAskMove) {
    reasons.push("askMove moment(s) but no non-empty expectedMoves");
  }

  return reasons;
}

function readTitleSnippet(title) {
  if (title && typeof title === "object" && title.values && typeof title.values === "object") {
    const v = title.values;
    const en = typeof v.en === "string" ? v.en.trim() : "";
    const nl = typeof v.nl === "string" ? v.nl.trim() : "";
    return en || nl || JSON.stringify(v).slice(0, 80);
  }
  return String(title ?? "").slice(0, 80);
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing (server/.env)");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const books = await db.collection("books").find({ isDeleted: { $ne: true } }).toArray();

  const problems = [];
  let scannedBooks = 0;
  let scannedSteps = 0;

  for (const book of books) {
    scannedBooks += 1;
    const bookId = String(book.bookId ?? "");
    const bookTitle = readTitleSnippet(book.title);
    const lessons = Array.isArray(book.lessons) ? book.lessons : [];

    for (const lesson of lessons) {
      const lessonId = String(lesson.id ?? lesson.lessonId ?? "");
      const bundle = lesson.authoringV2;
      if (!bundle || typeof bundle !== "object" || !bundle.stepsById || typeof bundle.stepsById !== "object") {
        continue;
      }

      const stepIds = Array.isArray(bundle.authoringLesson?.stepIds)
        ? bundle.authoringLesson.stepIds
        : Object.keys(bundle.stepsById);

      for (const sid of stepIds) {
        const step = bundle.stepsById[sid];
        if (!step) continue;
        scannedSteps += 1;
        const reasons = analyzeAuthoringStep(step);
        if (reasons.length) {
          problems.push({ bookId, bookTitle, lessonId, stepId: sid, reasons });
        }
      }
    }
  }

  const out = {
    scannedBooks,
    scannedSteps,
    problemSteps: problems.length,
    samples: problems.slice(0, 50),
  };

  const outPath = path.join(__dirname, "..", "..", "audit-empty-puzzle-steps.result.json");
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(out, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("[audit-empty-puzzle-steps] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
