import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { StepModel } from "../models/StepModel";
import { LessonModel } from "../models/LessonModel";

const PUZZELS_TAG_QUERY = "puzzels-import";

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
    // Find all steps that belong to puzzle-import books (via bookId tag join via BookModel)
    const { BookModel } = await import("../models/BookModel");
    const puzzleBooks = await BookModel.find(
      { isDeleted: false, tags: PUZZELS_TAG_QUERY },
      { bookId: 1 }
    ).lean();
    const puzzleBookIds = puzzleBooks
      .map((b) => String((b as { bookId?: unknown }).bookId ?? ""))
      .filter(Boolean);

    if (puzzleBookIds.length === 0) {
      process.stderr.write("[remove-empty-imported-puzzles] no puzzle books found\n");
      return;
    }

    const steps = await StepModel.find({
      isDeleted: false,
      bookId: { $in: puzzleBookIds },
    }).lean();

    let scannedSteps = 0;
    let removedSteps = 0;
    const stepsToRemove: string[] = [];

    for (const step of steps) {
      scannedSteps += 1;
      if (isEmptyImportedPuzzleStep(step as Record<string, unknown>)) {
        const stepId = String((step as { stepId?: unknown }).stepId ?? "");
        stepsToRemove.push(stepId);
        removedSteps += 1;
      }
    }

    process.stderr.write(
      `[remove-empty-imported-puzzles] summary ${JSON.stringify({
        mode: write ? "write" : "dry-run",
        scannedSteps,
        emptySteps: removedSteps,
        puzzleBooks: puzzleBookIds.length,
      })}\n`
    );

    if (!write || stepsToRemove.length === 0) return;

    const now = new Date().toISOString();
    await StepModel.updateMany(
      { stepId: { $in: stepsToRemove } },
      { $set: { isDeleted: true, deletedAt: now, deletedBy: "removeEmptyImportedPuzzles" } }
    );

    // Pull removed stepIds from their lessons
    await LessonModel.updateMany(
      { stepIds: { $in: stepsToRemove } },
      { $pull: { stepIds: { $in: stepsToRemove } } }
    );

    process.stderr.write(
      `[remove-empty-imported-puzzles] deleted ${stepsToRemove.length} empty steps\n`
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
