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
  /** If true: only puzzels-import (legacy). If false: all non-deleted books for owner (curriculum + puzzels). */
  const puzzlesOnly = args.includes("--puzzles-only");
  return {
    ownerType: ownerTypeArg ? ownerTypeArg.slice("--ownerType=".length).trim() : "user",
    ownerId: ownerIdArg ? ownerIdArg.slice("--ownerId=".length).trim() : "dev-user-1",
    sourceDb: sourceDbArg ? sourceDbArg.slice("--sourceDb=".length).trim() : "test",
    targetDb: targetDbArg ? targetDbArg.slice("--targetDb=".length).trim() : "kid_draughts",
    write,
    puzzlesOnly,
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
    const tags = Array.isArray(book.tags) ? book.tags : [];
    const isPuzzelsImport = tags.includes("puzzels-import");
    return {
      bookId: book.bookId || book.id || "",
      sequenceIndex: Number.isFinite(Number(book.sequenceIndex)) ? Number(book.sequenceIndex) : null,
      lessons: lessons.length,
      steps,
      bytes: Buffer.byteLength(JSON.stringify(book)),
      isPuzzelsImport,
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
  const { ownerType, ownerId, sourceDb, targetDb, write, puzzlesOnly } = parseFlags();
  const sourceUri = dbUriFromBase(baseUri, sourceDb);
  const targetUri = dbUriFromBase(baseUri, targetDb);
  const ownerFilter = { ownerType, ownerId };
  const activeBookFilter = {
    ...ownerFilter,
    $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
  };

  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const targetConn = await mongoose.createConnection(targetUri).asPromise();
  try {
    const sourceBooksCol = sourceConn.db.collection("books");
    const targetBooksCol = targetConn.db.collection("books");
    const targetPlaybackCol = targetConn.db.collection("playback_steps");

    const sourceQuery = puzzlesOnly
      ? { ...ownerFilter, isDeleted: false, tags: "puzzels-import" }
      : activeBookFilter;

    const sourceBooks = await sourceBooksCol.find(sourceQuery).toArray();
    const sourceSummary = summarizeBooks(sourceBooks);
    const sourceSteps = sourceSummary.reduce((sum, row) => sum + row.steps, 0);
    const puzzleRows = sourceSummary.filter((r) => r.isPuzzelsImport);
    const curriculumRows = sourceSummary.filter((r) => !r.isPuzzelsImport);

    console.log(
      `[sync-test-to-kid] source=${sourceDb} target=${targetDb} owner=${ownerType}:${ownerId} write=${write} mode=${puzzlesOnly ? "puzzles-only" : "all-owner-books"}`
    );
    console.log(
      `[sync-test-to-kid] sourceBooks=${sourceSummary.length} (curriculum=${curriculumRows.length} puzzels-import=${puzzleRows.length}) sourceSteps=${sourceSteps}`
    );
    sourceSummary.forEach((row) => {
      const kind = row.isPuzzelsImport ? "puzzels" : "curriculum";
      console.log(
        `[sync-test-to-kid] source [${kind}] book=${row.bookId} seq=${row.sequenceIndex} lessons=${row.lessons} steps=${row.steps} bytes=${row.bytes}`
      );
    });

    if (!write) {
      console.log(
        "[sync-test-to-kid] dry-run only (use --write to apply). Full sync replaces ALL books for this owner on target unless --puzzles-only."
      );
      return;
    }

    if (puzzlesOnly) {
      await targetBooksCol.deleteMany({ ...ownerFilter, tags: "puzzels-import" });
    } else {
      await targetBooksCol.deleteMany(ownerFilter);
    }
    await targetPlaybackCol.deleteMany(ownerFilter);

    if (sourceBooks.length > 0) {
      const cloned = sourceBooks.map((book) => {
        const { _id, ...rest } = book;
        return rest;
      });
      await targetBooksCol.insertMany(cloned, { ordered: false });
    }
    console.log(
      `[sync-test-to-kid] copiedBooks=${sourceBooks.length} from ${sourceDb} to ${targetDb}`
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

    const targetBooks = await targetBooksCol.find(activeBookFilter).toArray();
    const targetSummary = summarizeBooks(targetBooks);
    const targetSteps = targetSummary.reduce((sum, row) => sum + row.steps, 0);
    const targetPuzzle = targetSummary.filter((r) => r.isPuzzelsImport);
    const targetCurriculum = targetSummary.filter((r) => !r.isPuzzelsImport);
    const targetPlaybackSteps = await targetPlaybackCol.countDocuments(ownerFilter);
    console.log(
      `[sync-test-to-kid] done targetBooks=${targetSummary.length} (curriculum=${targetCurriculum.length} puzzels-import=${targetPuzzle.length}) targetSteps=${targetSteps} playbackSteps=${targetPlaybackSteps}`
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
