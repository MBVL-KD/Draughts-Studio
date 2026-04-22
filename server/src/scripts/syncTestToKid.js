require("dotenv/config");
const { execFileSync } = require("node:child_process");
const mongoose = require("mongoose");

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((arg) => arg.startsWith("--ownerType="));
  const ownerIdArg = args.find((arg) => arg.startsWith("--ownerId="));
  const sourceDbArg = args.find((arg) => arg.startsWith("--sourceDb="));
  const targetDbArg = args.find((arg) => arg.startsWith("--targetDb="));
  const write = args.includes("--write");
  return {
    ownerType: ownerTypeArg ? ownerTypeArg.slice("--ownerType=".length).trim() : "user",
    ownerId: ownerIdArg ? ownerIdArg.slice("--ownerId=".length).trim() : "dev-user-1",
    sourceDb: sourceDbArg ? sourceDbArg.slice("--sourceDb=".length).trim() : "test",
    targetDb: targetDbArg ? targetDbArg.slice("--targetDb=".length).trim() : "kid_draughts",
    write,
  };
}

function dbUriFromBase(baseUri, dbName) {
  const q = baseUri.indexOf("?");
  const base = q >= 0 ? baseUri.slice(0, q) : baseUri;
  const qs = q >= 0 ? baseUri.slice(q) : "";
  const p = base.indexOf("://");
  const slash = base.indexOf("/", p + 3);
  if (slash < 0) return `${base}/${dbName}${qs}`;
  return `${base.slice(0, slash)}/${dbName}${qs}`;
}

function summarizeBooks(books) {
  return books.map((book) => {
    const lessons = Array.isArray(book.lessons) ? book.lessons : [];
    let steps = 0;
    for (const lesson of lessons) {
      if (Array.isArray(lesson?.authoringV2?.authoringLesson?.stepIds)) {
        steps += lesson.authoringV2.authoringLesson.stepIds.length;
      } else if (Array.isArray(lesson?.steps)) {
        steps += lesson.steps.length;
      }
    }
    return {
      bookId: book.bookId || book.id || "",
      sequenceIndex: Number.isFinite(Number(book.sequenceIndex)) ? Number(book.sequenceIndex) : null,
      lessons: lessons.length,
      steps,
      bytes: Buffer.byteLength(JSON.stringify(book)),
    };
  });
}

function runTargetCommand(targetUri, command, extraArgs) {
  execFileSync("npm", ["run", command, "--", ...extraArgs], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      MONGO_URI: targetUri,
    },
  });
}

async function run() {
  const baseUri = process.env.MONGO_URI;
  if (!baseUri) throw new Error("MONGO_URI missing");
  const { ownerType, ownerId, sourceDb, targetDb, write } = parseFlags();
  const sourceUri = dbUriFromBase(baseUri, sourceDb);
  const targetUri = dbUriFromBase(baseUri, targetDb);
  const ownerFilter = { ownerType, ownerId };

  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const targetConn = await mongoose.createConnection(targetUri).asPromise();
  try {
    const sourceBooksCol = sourceConn.db.collection("books");
    const targetBooksCol = targetConn.db.collection("books");
    const targetPlaybackCol = targetConn.db.collection("playback_steps");

    const sourceBooks = await sourceBooksCol
      .find({ ...ownerFilter, isDeleted: false, tags: "puzzels-import" })
      .toArray();
    const sourceSummary = summarizeBooks(sourceBooks);
    const sourceSteps = sourceSummary.reduce((sum, row) => sum + row.steps, 0);

    console.log(
      `[sync-test-to-kid] source=${sourceDb} target=${targetDb} owner=${ownerType}:${ownerId} write=${write}`
    );
    console.log(
      `[sync-test-to-kid] sourcePuzzleBooks=${sourceSummary.length} sourcePuzzleSteps=${sourceSteps}`
    );
    sourceSummary.forEach((row) => {
      console.log(
        `[sync-test-to-kid] source book=${row.bookId} seq=${row.sequenceIndex} lessons=${row.lessons} steps=${row.steps} bytes=${row.bytes}`
      );
    });

    if (!write) {
      console.log("[sync-test-to-kid] dry-run only (use --write to apply)");
      return;
    }

    await targetBooksCol.deleteMany({ ...ownerFilter, tags: "puzzels-import" });
    await targetPlaybackCol.deleteMany(ownerFilter);

    if (sourceBooks.length > 0) {
      const cloned = sourceBooks.map((book) => {
        const { _id, ...rest } = book;
        return rest;
      });
      await targetBooksCol.insertMany(cloned, { ordered: false });
    }
    console.log(
      `[sync-test-to-kid] copiedPuzzleBooks=${sourceBooks.length} from ${sourceDb} to ${targetDb}`
    );

    runTargetCommand(targetUri, "split:large-puzzels-books", [
      "--write",
      `--ownerType=${ownerType}`,
      `--ownerId=${ownerId}`,
    ]);
    runTargetCommand(targetUri, "reindex:playback-steps", [
      `--ownerType=${ownerType}`,
      `--ownerId=${ownerId}`,
    ]);

    const targetBooks = await targetBooksCol
      .find({ ...ownerFilter, isDeleted: false, tags: "puzzels-import" })
      .sort({ sequenceIndex: 1 })
      .toArray();
    const targetSummary = summarizeBooks(targetBooks);
    const targetSteps = targetSummary.reduce((sum, row) => sum + row.steps, 0);
    const targetPlaybackSteps = await targetPlaybackCol.countDocuments(ownerFilter);
    console.log(
      `[sync-test-to-kid] done targetPuzzleBooks=${targetSummary.length} targetPuzzleSteps=${targetSteps} playbackSteps=${targetPlaybackSteps}`
    );
  } finally {
    await sourceConn.close();
    await targetConn.close();
  }
}

run().catch((error) => {
  console.error(
    `[sync-test-to-kid] fatal ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
