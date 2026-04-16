import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { syncLegacyStepsFromAuthoringBundle } from "../import/normalize/legacyImportStepToAuthoringV2";

const PUZZELS_TAG = "puzzels-import";

function parseFlags() {
  const args = process.argv.slice(2);
  return { write: args.includes("--write") };
}

function isEmptyImportedPuzzleStep(step: Record<string, unknown>): boolean {
  const timeline = Array.isArray(step.timeline) ? (step.timeline as Record<string, unknown>[]) : [];
  const hasAskSequence = timeline.some(
    (m) =>
      m?.type === "askSequence" &&
      (m.interaction as Record<string, unknown> | undefined)?.kind === "askSequence" &&
      Array.isArray((m.interaction as Record<string, unknown> | undefined)?.expectedSequence) &&
      ((m.interaction as Record<string, unknown>).expectedSequence as unknown[]).length > 0
  );
  return !hasAskSequence;
}

async function run() {
  const { write } = parseFlags();
  process.stderr.write(
    `[remove-empty-imported-puzzles] start mode=${write ? "write" : "dry-run"}\n`
  );
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await connectMongo(uri);
  try {
    const books = await BookModel.find({ isDeleted: false, tags: PUZZELS_TAG }).lean();
    let scannedBooks = 0;
    let changedBooks = 0;
    let removedSteps = 0;

    for (const book of books) {
      scannedBooks += 1;
      let bookChanged = false;
      const nextBook = structuredClone(book) as Record<string, unknown>;
      const lessons = Array.isArray(nextBook.lessons)
        ? (nextBook.lessons as Record<string, unknown>[])
        : [];

      for (const lesson of lessons) {
        const bundle = lesson.authoringV2 as
          | {
              authoringLesson?: { stepIds?: string[]; entryStepId?: string };
              stepsById?: Record<string, Record<string, unknown>>;
            }
          | undefined;
        if (!bundle?.authoringLesson || !bundle.stepsById) continue;
        const stepIds = Array.isArray(bundle.authoringLesson.stepIds)
          ? [...bundle.authoringLesson.stepIds]
          : [];
        if (!stepIds.length) continue;
        const keptIds: string[] = [];
        for (const sid of stepIds) {
          const a = bundle.stepsById[sid];
          if (a && isEmptyImportedPuzzleStep(a)) {
            delete bundle.stepsById[sid];
            removedSteps += 1;
            bookChanged = true;
            continue;
          }
          keptIds.push(sid);
        }
        if (keptIds.length !== stepIds.length) {
          bundle.authoringLesson.stepIds = keptIds;
          bundle.authoringLesson.entryStepId = keptIds[0] ?? bundle.authoringLesson.entryStepId;
          lesson.steps = syncLegacyStepsFromAuthoringBundle(bundle as unknown as Record<string, unknown>);
          lesson.authoringV2 = bundle;
        }
      }

      if (bookChanged) {
        changedBooks += 1;
        if (write) {
          await BookModel.updateOne({ _id: (book as { _id: unknown })._id }, { $set: nextBook });
        }
      }
    }

    process.stderr.write(
      `[remove-empty-imported-puzzles] summary ${JSON.stringify({
        mode: write ? "write" : "dry-run",
        scannedBooks,
        changedBooks,
        removedSteps,
      })}\n`
    );
  } finally {
    await disconnectMongo();
  }
}

run().catch((error) => {
  console.error(
    `[remove-empty-imported-puzzles] fatal error=${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});

