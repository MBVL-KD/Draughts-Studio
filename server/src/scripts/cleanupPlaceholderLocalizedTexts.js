const mongoose = require("mongoose");
const connectMongo = require("../config/mongo");

const PLACEHOLDERS = new Set([
  "new book",
  "new lesson",
  "new step",
  "coach text",
  "intro",
  "checkpoint",
  "option a",
  "option b",
]);

const FIELD_PATHS = [
  "title",
  "description",
  "lessons.*.title",
  "lessons.*.description",
  "lessons.*.steps.*.title",
  "lessons.*.steps.*.prompt",
  "lessons.*.steps.*.hint",
  "lessons.*.steps.*.explanation",
  "lessons.*.steps.*.feedback.correct",
  "lessons.*.steps.*.feedback.incorrect",
  "lessons.*.steps.*.presentation.npc.text",
  "lessons.*.authoringV2.authoringLesson.title",
  "lessons.*.authoringV2.authoringLesson.description",
];

function tokenizePath(path) {
  const parts = path.split(".");
  return parts;
}

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clearPlaceholdersInLocalized(value) {
  if (!value || typeof value !== "object" || !value.values || typeof value.values !== "object") return false;
  let changed = false;
  for (const key of Object.keys(value.values)) {
    const v = value.values[key];
    if (typeof v !== "string") continue;
    if (PLACEHOLDERS.has(normalize(v))) {
      value.values[key] = "";
      changed = true;
    }
  }
  return changed;
}

function visitPath(root, pathParts, cb) {
  function walk(node, idx) {
    if (idx >= pathParts.length) {
      cb(node);
      return;
    }
    const part = pathParts[idx];
    if (part === "*") {
      if (!Array.isArray(node)) return;
      for (const item of node) walk(item, idx + 1);
      return;
    }
    if (!node || typeof node !== "object" || !(part in node)) return;
    walk(node[part], idx + 1);
  }
  walk(root, 0);
}

async function run() {
  await connectMongo();
  const collection = mongoose.connection.collection("books");
  const books = await collection.find({ isDeleted: { $ne: true } }).toArray();

  let updatedBooks = 0;
  let cleanedFields = 0;
  for (const book of books) {
    let changed = false;
    const next = JSON.parse(JSON.stringify(book));

    for (const wildcardPath of FIELD_PATHS) {
      const parts = tokenizePath(wildcardPath);
      visitPath(next, parts, (node) => {
        if (clearPlaceholdersInLocalized(node)) {
          changed = true;
          cleanedFields += 1;
        }
      });
    }

    const lessons = Array.isArray(next.lessons) ? next.lessons : [];
    for (let li = 0; li < lessons.length; li += 1) {
      const authoring = lessons[li]?.authoringV2;
      const stepsById =
        authoring && typeof authoring === "object" && authoring.stepsById && typeof authoring.stepsById === "object"
          ? authoring.stepsById
          : null;
      if (!stepsById) continue;
      for (const stepNode of Object.values(stepsById)) {
        const timeline = Array.isArray(stepNode?.timeline) ? stepNode.timeline : [];
        for (const moment of timeline) {
          if (!moment || typeof moment !== "object") continue;
          const fields = [moment.title, moment.body, moment.caption];
          for (const field of fields) {
            if (clearPlaceholdersInLocalized(field)) {
              changed = true;
              cleanedFields += 1;
            }
          }
          const coaches = Array.isArray(moment.coach) ? moment.coach : [];
          for (const coach of coaches) {
            if (clearPlaceholdersInLocalized(coach?.text)) {
              changed = true;
              cleanedFields += 1;
            }
          }
        }
      }
    }

    if (!changed) continue;
    await collection.updateOne(
      { _id: book._id },
      { $set: { title: next.title, description: next.description, lessons: next.lessons, updatedAt: new Date() } }
    );
    updatedBooks += 1;
  }

  console.log(JSON.stringify({ ok: true, scannedBooks: books.length, updatedBooks, cleanedFields }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("cleanupPlaceholderLocalizedTexts failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {}
  process.exit(1);
});
