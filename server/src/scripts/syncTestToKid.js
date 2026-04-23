require("dotenv/config");
const mongoose = require("mongoose");

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((arg) => arg.startsWith("--ownerType="));
  const ownerIdArg = args.find((arg) => arg.startsWith("--ownerId="));
  const sourceDbArg = args.find((arg) => arg.startsWith("--sourceDb="));
  const targetDbArg = args.find((arg) => arg.startsWith("--targetDb="));
  const write = args.includes("--write");
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

function stripId(doc) {
  const { _id, ...rest } = doc;
  return rest;
}

async function run() {
  const baseUri = process.env.MONGO_URI;
  if (!baseUri) throw new Error("MONGO_URI missing");
  const { ownerType, ownerId, sourceDb, targetDb, write, puzzlesOnly } = parseFlags();
  const sourceUri = dbUriFromBase(baseUri, sourceDb);
  const targetUri = dbUriFromBase(baseUri, targetDb);
  const ownerFilter = { ownerType, ownerId };
  const activeFilter = { ...ownerFilter, $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };

  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const targetConn = await mongoose.createConnection(targetUri).asPromise();

  try {
    const srcBooks = sourceConn.db.collection("books");
    const srcLessons = sourceConn.db.collection("lessons");
    const srcSteps = sourceConn.db.collection("steps");
    const tgtBooks = targetConn.db.collection("books");
    const tgtLessons = targetConn.db.collection("lessons");
    const tgtSteps = targetConn.db.collection("steps");

    const bookQuery = puzzlesOnly
      ? { ...ownerFilter, isDeleted: false, tags: "puzzels-import" }
      : activeFilter;

    // ── Gather source data ───────────────────────────────────────────────────
    const sourceBooks = await srcBooks.find(bookQuery).toArray();

    const sourceBookIds = sourceBooks.map((b) => b.bookId || b.id).filter(Boolean);
    const lessonQuery = puzzlesOnly
      ? { ...ownerFilter, bookId: { $in: sourceBookIds }, isDeleted: { $ne: true } }
      : { ...ownerFilter, isDeleted: { $ne: true } };
    const stepQuery = puzzlesOnly
      ? { ...ownerFilter, bookId: { $in: sourceBookIds }, isDeleted: { $ne: true } }
      : { ...ownerFilter, isDeleted: { $ne: true } };

    const sourceLessonDocs = await srcLessons.find(lessonQuery).toArray();
    const sourceStepDocs = await srcSteps.find(stepQuery).toArray();

    // ── Summary ──────────────────────────────────────────────────────────────
    const lessonCountByBookId = new Map();
    const stepCountByBookId = new Map();
    for (const l of sourceLessonDocs) {
      const bid = l.bookId || "";
      lessonCountByBookId.set(bid, (lessonCountByBookId.get(bid) ?? 0) + 1);
    }
    for (const s of sourceStepDocs) {
      const bid = s.bookId || "";
      stepCountByBookId.set(bid, (stepCountByBookId.get(bid) ?? 0) + 1);
    }

    console.log(
      `[sync-test-to-kid] source=${sourceDb} target=${targetDb} owner=${ownerType}:${ownerId} write=${write} mode=${puzzlesOnly ? "puzzles-only" : "all-owner-books"}`
    );
    console.log(
      `[sync-test-to-kid] sourceBooks=${sourceBooks.length} sourceLessons=${sourceLessonDocs.length} sourceSteps=${sourceStepDocs.length}`
    );
    for (const book of sourceBooks) {
      const bookId = book.bookId || book.id || "";
      const tags = Array.isArray(book.tags) ? book.tags : [];
      const kind = tags.includes("puzzels-import") ? "puzzels" : "curriculum";
      const seq = Number.isFinite(Number(book.sequenceIndex)) ? Number(book.sequenceIndex) : null;
      console.log(
        `[sync-test-to-kid] source [${kind}] book=${bookId} seq=${seq} lessons=${lessonCountByBookId.get(bookId) ?? 0} steps=${stepCountByBookId.get(bookId) ?? 0}`
      );
    }

    if (!write) {
      console.log(
        "[sync-test-to-kid] dry-run only (use --write to apply). Full sync replaces ALL data for this owner on target unless --puzzles-only."
      );
      return;
    }

    // ── Delete target data ───────────────────────────────────────────────────
    if (puzzlesOnly) {
      const tgtPuzzleBooks = await tgtBooks.find({ ...ownerFilter, tags: "puzzels-import" }, { projection: { bookId: 1, id: 1 } }).toArray();
      const tgtPuzzleBookIds = tgtPuzzleBooks.map((b) => b.bookId || b.id).filter(Boolean);
      await tgtBooks.deleteMany({ ...ownerFilter, tags: "puzzels-import" });
      if (tgtPuzzleBookIds.length > 0) {
        await tgtLessons.deleteMany({ ...ownerFilter, bookId: { $in: tgtPuzzleBookIds } });
        await tgtSteps.deleteMany({ ...ownerFilter, bookId: { $in: tgtPuzzleBookIds } });
      }
    } else {
      await tgtBooks.deleteMany(ownerFilter);
      await tgtLessons.deleteMany(ownerFilter);
      await tgtSteps.deleteMany(ownerFilter);
    }

    // ── Insert source data ───────────────────────────────────────────────────
    if (sourceBooks.length > 0) {
      await tgtBooks.insertMany(sourceBooks.map(stripId), { ordered: false });
    }
    if (sourceLessonDocs.length > 0) {
      await tgtLessons.insertMany(sourceLessonDocs.map(stripId), { ordered: false });
    }
    if (sourceStepDocs.length > 0) {
      await tgtSteps.insertMany(sourceStepDocs.map(stripId), { ordered: false });
    }

    // ── Final count ──────────────────────────────────────────────────────────
    const tgtBookCount = await tgtBooks.countDocuments(activeFilter);
    const tgtLessonCount = await tgtLessons.countDocuments(ownerFilter);
    const tgtStepCount = await tgtSteps.countDocuments(ownerFilter);
    console.log(
      `[sync-test-to-kid] done targetBooks=${tgtBookCount} targetLessons=${tgtLessonCount} targetSteps=${tgtStepCount}`
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
