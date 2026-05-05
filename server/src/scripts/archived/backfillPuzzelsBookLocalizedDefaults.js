const mongoose = require("mongoose");
const connectMongo = require("../config/mongo");

const PUZZELS_BOOK_TAG = "puzzels-import";

function isBlank(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

function ensureLocalizedText(node, fallbackEn, fallbackNl) {
  const next = node && typeof node === "object" ? { ...node } : {};
  const values = next.values && typeof next.values === "object" ? { ...next.values } : {};
  if (isBlank(values.en)) values.en = fallbackEn;
  if (isBlank(values.nl)) values.nl = fallbackNl;
  next.values = values;
  return next;
}

async function run() {
  await connectMongo();
  const collection = mongoose.connection.collection("books");
  const books = await collection
    .find({ tags: PUZZELS_BOOK_TAG, isDeleted: { $ne: true } })
    .toArray();

  let updatedBooks = 0;
  let updatedSteps = 0;

  for (const book of books) {
    const nextBook = { ...book };
    nextBook.title = ensureLocalizedText(nextBook.title, "Puzzles", "Puzzels");
    nextBook.description = ensureLocalizedText(
      nextBook.description,
      "Imported puzzles (Slagzet). Each lesson is a collection.",
      "Geïmporteerde puzzels (Slagzet). Elke les is een collectie."
    );

    const lessons = Array.isArray(nextBook.lessons) ? [...nextBook.lessons] : [];
    for (let li = 0; li < lessons.length; li += 1) {
      const lesson = lessons[li] && typeof lessons[li] === "object" ? { ...lessons[li] } : lessons[li];
      if (!lesson || typeof lesson !== "object") continue;
      lesson.title = ensureLocalizedText(lesson.title, "Puzzle Collection", "Puzzelcollectie");
      lesson.description = ensureLocalizedText(
        lesson.description,
        "Practice with imported tactical puzzles.",
        "Oefen met geimporteerde tactische puzzels."
      );

      const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
      for (let si = 0; si < steps.length; si += 1) {
        const step = steps[si] && typeof steps[si] === "object" ? { ...steps[si] } : steps[si];
        if (!step || typeof step !== "object") continue;
        step.title = ensureLocalizedText(step.title, "Puzzle", "Puzzel");
        step.prompt = ensureLocalizedText(step.prompt, "Solve the puzzle.", "Los de puzzel op.");
        step.hint = ensureLocalizedText(
          step.hint,
          "Look for the forcing capture path.",
          "Zoek naar de geforceerde slagzetreeks."
        );
        step.explanation = ensureLocalizedText(
          step.explanation,
          "This puzzle trains tactical vision.",
          "Deze puzzel traint je tactisch inzicht."
        );
        const feedback = step.feedback && typeof step.feedback === "object" ? { ...step.feedback } : {};
        feedback.correct = ensureLocalizedText(feedback.correct, "Correct.", "Goed gedaan.");
        feedback.incorrect = ensureLocalizedText(feedback.incorrect, "Try again.", "Probeer opnieuw.");
        step.feedback = feedback;
        const presentation =
          step.presentation && typeof step.presentation === "object" ? { ...step.presentation } : {};
        const npc = presentation.npc && typeof presentation.npc === "object" ? { ...presentation.npc } : {};
        npc.text = ensureLocalizedText(npc.text, "Find the best move.", "Vind de beste zet.");
        presentation.npc = npc;
        step.presentation = presentation;
        steps[si] = step;
        updatedSteps += 1;
      }

      lesson.steps = steps;
      lessons[li] = lesson;
    }

    nextBook.lessons = lessons;
    await collection.updateOne(
      { _id: book._id },
      {
        $set: {
          title: nextBook.title,
          description: nextBook.description,
          lessons: nextBook.lessons,
          updatedAt: new Date(),
        },
      }
    );
    updatedBooks += 1;
  }

  console.log(JSON.stringify({ ok: true, matchedBooks: books.length, updatedBooks, updatedSteps }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("backfillPuzzelsBookLocalizedDefaults failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {}
  process.exit(1);
});
