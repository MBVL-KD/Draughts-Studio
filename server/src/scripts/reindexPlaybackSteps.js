require("dotenv/config");
const mongoose = require("mongoose");

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((arg) => arg.startsWith("--ownerType="));
  const ownerIdArg = args.find((arg) => arg.startsWith("--ownerId="));
  const ownerType = ownerTypeArg ? ownerTypeArg.slice("--ownerType=".length).trim() : "";
  const ownerId = ownerIdArg ? ownerIdArg.slice("--ownerId=".length).trim() : "";
  return {
    ownerType: ownerType || undefined,
    ownerId: ownerId || undefined,
  };
}

function stepIdOf(step) {
  if (!step || typeof step !== "object") return "";
  const id = step.stepId || step.id;
  return typeof id === "string" ? id : "";
}

function lessonIdOf(lesson) {
  if (!lesson || typeof lesson !== "object") return "";
  const id = lesson.lessonId || lesson.id;
  return typeof id === "string" ? id : "";
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  const { ownerType, ownerId } = parseFlags();

  await mongoose.connect(uri);
  try {
    const booksCol = mongoose.connection.collection("books");
    const idxCol = mongoose.connection.collection("playback_steps");
    const filter = { isDeleted: false };
    if (ownerType && ownerId) {
      filter.ownerType = ownerType;
      filter.ownerId = ownerId;
    }

    const books = await booksCol.find(filter).toArray();
    console.log(
      `[reindex-playback] start books=${books.length} ownerFilter=${ownerType || "*"}:${ownerId || "*"}`
    );

    if (ownerType && ownerId) {
      await idxCol.deleteMany({ ownerType, ownerId });
    } else {
      await idxCol.deleteMany({});
    }

    const docs = [];
    for (const book of books) {
      const owner = {
        ownerType: String(book.ownerType || "user"),
        ownerId: String(book.ownerId || ""),
      };
      const bookId = String(book.bookId || book.id || "").trim();
      const bookRevision = Number.isFinite(Number(book.revision)) ? Number(book.revision) : 1;
      const lessons = Array.isArray(book.lessons) ? book.lessons : [];
      for (const lesson of lessons) {
        const lessonId = lessonIdOf(lesson);
        if (!lessonId) continue;
        const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
        const authoring = lesson.authoringV2 && typeof lesson.authoringV2 === "object"
          ? lesson.authoringV2
          : {};
        const authoringStepIds = Array.isArray(authoring?.authoringLesson?.stepIds)
          ? authoring.authoringLesson.stepIds.filter((id) => typeof id === "string")
          : [];
        const orderedStepIds = authoringStepIds.length > 0
          ? authoringStepIds
          : steps.map(stepIdOf).filter(Boolean);
        for (const step of steps) {
          const stepId = stepIdOf(step);
          if (!stepId) continue;
          docs.push({
            id: `${owner.ownerType}:${owner.ownerId}:${bookId}:${lessonId}:${stepId}`,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            bookId,
            lessonId,
            stepId,
            bookRevision,
            variantId: typeof lesson.variantId === "string" ? lesson.variantId : null,
            step,
            authoringStep:
              authoring?.stepsById && typeof authoring.stepsById === "object"
                ? authoring.stepsById[stepId] ?? null
                : null,
            orderedStepIds,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }

    if (docs.length > 0) {
      await idxCol.insertMany(docs, { ordered: false });
    }
    console.log(`[reindex-playback] done steps=${docs.length}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(`[reindex-playback] fatal ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
