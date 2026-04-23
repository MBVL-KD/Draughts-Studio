const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

const DEFAULT_HINT_PLAN = [
  { type: "path_pulse_stepwise", afterFailedAttempts: 1 },
  { type: "from", afterFailedAttempts: 2 },
  { type: "path_numbers", afterFailedAttempts: 3 },
  { type: "to", afterFailedAttempts: 4 },
  { type: "captures", afterFailedAttempts: 5 },
];

function emptyLocalized() {
  return { values: { en: "", nl: "" } };
}

function normalizeAskSequenceMoment(moment) {
  if (!moment || moment.type !== "askSequence") return moment;
  const ix = moment.interaction;
  if (!ix || ix.kind !== "askSequence") return moment;
  const hintPlan = Array.isArray(ix.hintPlan) && ix.hintPlan.length > 0 ? ix.hintPlan : DEFAULT_HINT_PLAN;
  return {
    ...moment,
    body: emptyLocalized(),
    interaction: {
      ...ix,
      hintPlan,
    },
  };
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) return timeline;
  const filtered = timeline.filter((m) => m && m.type !== "introText");
  return filtered.map(normalizeAskSequenceMoment);
}

function normalizeBook(book) {
  const lessons = Array.isArray(book.lessons) ? book.lessons : [];
  let touched = false;

  const nextLessons = lessons.map((lesson) => {
    let lessonTouched = false;
    const nextLesson = { ...lesson };

    if (Array.isArray(lesson.steps)) {
      nextLesson.steps = lesson.steps.map((step) => {
        if (!step || typeof step !== "object") return step;
        const nextStep = { ...step };
        const beforePrompt = JSON.stringify(nextStep.prompt ?? null);
        nextStep.prompt = emptyLocalized();
        if (JSON.stringify(nextStep.prompt) !== beforePrompt) lessonTouched = true;
        return nextStep;
      });
    }

    const bundle = lesson.authoringV2;
    if (bundle && typeof bundle === "object") {
      const nextBundle = { ...bundle };
      if (nextBundle.stepsById && typeof nextBundle.stepsById === "object") {
        const nextStepsById = {};
        for (const [sid, step] of Object.entries(nextBundle.stepsById)) {
          if (!step || typeof step !== "object") {
            nextStepsById[sid] = step;
            continue;
          }
          const nextStep = { ...step };
          if (Array.isArray(nextStep.timeline)) {
            const normalizedTimeline = normalizeTimeline(nextStep.timeline);
            if (JSON.stringify(normalizedTimeline) !== JSON.stringify(nextStep.timeline)) {
              lessonTouched = true;
            }
            nextStep.timeline = normalizedTimeline;
          }
          nextStepsById[sid] = nextStep;
        }
        nextBundle.stepsById = nextStepsById;
      }
      nextLesson.authoringV2 = nextBundle;
    }

    if (lessonTouched) touched = true;
    return nextLesson;
  });

  return { touched, lessons: nextLessons };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const books = await db.collection("books").find({ isDeleted: { $ne: true } }).toArray();
  let updated = 0;

  for (const book of books) {
    const { touched, lessons } = normalizeBook(book);
    if (!touched) continue;
    await db.collection("books").updateOne(
      { _id: book._id },
      { $set: { lessons, updatedAt: new Date() } }
    );
    updated += 1;
  }

  console.log(JSON.stringify({ scanned: books.length, updated }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("[normalize-puzzle-hints-intro] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
