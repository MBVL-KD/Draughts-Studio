/**
 * Removes all puzzle import books (tag: puzzels-import) and their lessons/steps
 * from both `test` and `kid_draughts`, then resets all import jobs in `test`
 * so they can be re-run with the updated v2 pipeline.
 *
 * Usage:
 *   node src/scripts/resetPuzzleImport.js --write
 *   (without --write: dry-run, shows what would be deleted)
 */

require("dotenv/config");
const { MongoClient } = require("mongodb");

const WRITE_MODE = process.argv.includes("--write");
const PUZZELS_TAG = "puzzels-import";
const TARGET_DBS = ["test", "kid_draughts"];

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI environment variable is required.");
  process.exit(1);
}

async function resetDb(db) {
  const dbName = db.databaseName;

  // 1. Find all puzzle-import books
  const books = await db
    .collection("books")
    .find({ tags: PUZZELS_TAG }, { projection: { _id: 0, bookId: 1, id: 1, title: 1 } })
    .toArray();

  const bookIds = books.map((b) => b.bookId ?? b.id).filter(Boolean);

  console.log(`\n[${dbName}] Found ${books.length} puzzle books:`);
  for (const b of books) {
    const titleNl = b.title && b.title.values
      ? (b.title.values.nl || b.title.values.en || "(no title)")
      : "(no title)";
    console.log(`  - ${b.bookId ?? b.id}: ${titleNl}`);
  }

  if (bookIds.length === 0) {
    console.log(`[${dbName}] Nothing to delete.`);
    return;
  }

  // 2. Count what will be removed
  const [lessonCount, stepCount] = await Promise.all([
    db.collection("lessons").countDocuments({ bookId: { $in: bookIds } }),
    db.collection("steps").countDocuments({ bookId: { $in: bookIds } }),
  ]);
  console.log(
    `[${dbName}] Will delete: ${stepCount} steps, ${lessonCount} lessons, ${bookIds.length} books`
  );

  if (!WRITE_MODE) {
    console.log(`[${dbName}] DRY RUN — pass --write to execute`);
    return;
  }

  // 3. Delete steps → lessons → books
  const [stepsResult, lessonsResult, booksResult] = await Promise.all([
    db.collection("steps").deleteMany({ bookId: { $in: bookIds } }),
    db.collection("lessons").deleteMany({ bookId: { $in: bookIds } }),
    db.collection("books").deleteMany({ tags: PUZZELS_TAG }),
  ]);

  console.log(
    `[${dbName}] Deleted: ${stepsResult.deletedCount} steps, ${lessonsResult.deletedCount} lessons, ${booksResult.deletedCount} books`
  );
}

async function resetImportJobsInTest(db) {
  const dbName = db.databaseName;

  const jobs = await db
    .collection("import_jobs")
    .find({}, { projection: { _id: 0, jobId: 1, collectionTitle: 1, status: 1, totalItems: 1 } })
    .toArray();

  console.log(`\n[${dbName}] Found ${jobs.length} import jobs to reset:`);
  for (const j of jobs) {
    console.log(`  - ${j.jobId}: "${j.collectionTitle}" (${j.status}, ${j.totalItems} items)`);
  }

  if (jobs.length === 0) return;

  if (!WRITE_MODE) {
    console.log(`[${dbName}] DRY RUN — pass --write to execute job reset`);
    return;
  }

  // Reset all items to pending
  const itemsResult = await db.collection("import_items").updateMany(
    {},
    {
      $set: {
        status: "pending",
        processedAt: null,
        failureReason: null,
        importedStepId: null,
        importedLessonId: null,
        scanResult: null,
      },
      $unset: { processingStartedAt: "", skipReason: "" },
    }
  );

  // Reset job counters and status
  const jobsResult = await db.collection("import_jobs").updateMany(
    {},
    {
      $set: {
        status: "idle",
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        currentIndex: 0,
      },
      $inc: { revision: 1 },
    }
  );

  console.log(
    `[${dbName}] Reset ${jobsResult.modifiedCount} jobs, ${itemsResult.modifiedCount} items → pending/idle`
  );
}

async function main() {
  console.log(`Mode: ${WRITE_MODE ? "WRITE" : "DRY RUN"}`);

  const client = new MongoClient(MONGO_URI);
  await client.connect();

  try {
    for (const dbName of TARGET_DBS) {
      await resetDb(client.db(dbName));
    }
    await resetImportJobsInTest(client.db("test"));
  } finally {
    await client.close();
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
