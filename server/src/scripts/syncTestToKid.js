require("dotenv/config");
const { MongoClient } = require("mongodb");
const { createHash } = require("crypto");

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((a) => a.startsWith("--ownerType="));
  const ownerIdArg = args.find((a) => a.startsWith("--ownerId="));
  const sourceDbArg = args.find((a) => a.startsWith("--sourceDb="));
  const targetDbArg = args.find((a) => a.startsWith("--targetDb="));
  const bookIdArg = args.find((a) => a.startsWith("--bookId="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const titleContainsArg = args.find((a) => a.startsWith("--titleContains="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length).trim()) : null;
  return {
    ownerType: ownerTypeArg ? ownerTypeArg.slice("--ownerType=".length).trim() : "user",
    ownerId: ownerIdArg ? ownerIdArg.slice("--ownerId=".length).trim() : "dev-user-1",
    sourceDb: sourceDbArg ? sourceDbArg.slice("--sourceDb=".length).trim() : "test",
    targetDb: targetDbArg ? targetDbArg.slice("--targetDb=".length).trim() : "kid_draughts",
    bookId: bookIdArg ? bookIdArg.slice("--bookId=".length).trim() : "",
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : null,
    titleContains: titleContainsArg ? titleContainsArg.slice("--titleContains=".length).trim().toLowerCase() : "",
    write: args.includes("--write"),
    puzzlesOnly: args.includes("--puzzles-only"),
    lessonsOnly: args.includes("--lessons-only"),
  };
}

function stripId(doc) {
  const { _id, ...rest } = doc;
  return rest;
}

function runtimeKey(ownerId, bookId, lessonId, stepId) {
  return createHash("sha256")
    .update(`${ownerId}:${bookId || "book-unknown"}:${lessonId || "lesson-unknown"}:${stepId}`)
    .digest("hex");
}

function toCatalogEntry(step, ownerId, nowIso, runId) {
  const stepId = step.stepId || step.id;
  const bookId = step.bookId || null;
  const lessonId = step.lessonId || null;
  const pm = step.puzzleMeta || {};
  const variantId = step.initialState?.variantId || pm.variantId || "international";

  return {
    puzzleId: stepId,
    runtimeKey: runtimeKey(ownerId, bookId, lessonId, stepId),
    keyScope: { ownerId, bookId, lessonId, stepId },
    bookId,
    lessonId,
    stepId,
    active: step.isDeleted !== true,
    rating: {
      value: Number.isFinite(Number(pm.puzzleRating)) ? Number(pm.puzzleRating) : 1200,
      provisional: true,
      plays: 0,
    },
    quality: {
      importConfidence: Number.isFinite(Number(pm.importConfidence)) ? Number(pm.importConfidence) : 0.6,
    },
    meta: {
      variantId,
      topicTags: Array.isArray(pm.topicTags) ? pm.topicTags.filter((v) => typeof v === "string") : [],
      difficultyBand: pm.difficultyBand || null,
    },
    source: {
      type: "v2.steps",
      contentUpdatedAt: step.updatedAt || step.createdAt || nowIso,
    },
    sync: { lastSeenRunId: runId, syncedAt: nowIso },
    createdAt: step.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

async function upsertBatch(collection, docs, keyField, batchSize = 500) {
  let upserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const ops = batch.map((doc) => ({
      replaceOne: {
        filter: { [keyField]: doc[keyField] },
        replacement: stripId(doc),
        upsert: true,
      },
    }));
    await collection.bulkWrite(ops, { ordered: false });
    upserted += batch.length;
    process.stdout.write(`  ${upserted}/${docs.length}\r`);
  }
  process.stdout.write("\n");
  return upserted;
}

async function pruneRemoved(collection, ownerFilter, sourceIds, keyField, extraFilter = {}) {
  if (sourceIds.length === 0) return 0;
  const result = await collection.deleteMany({
    ...ownerFilter,
    ...extraFilter,
    [keyField]: { $nin: sourceIds },
  });
  return result.deletedCount;
}

async function rebuildCatalog(catalog, steps, ownerId, nowIso, runId, batchSize = 500) {
  let ops = [];
  let upserted = 0;
  for (const step of steps) {
    if (step.isDeleted === true) continue;
    const entry = toCatalogEntry(step, ownerId, nowIso, runId);
    ops.push({
      replaceOne: {
        filter: { puzzleId: entry.puzzleId },
        replacement: entry,
        upsert: true,
      },
    });
    if (ops.length >= batchSize) {
      await catalog.bulkWrite(ops, { ordered: false });
      upserted += ops.length;
      process.stdout.write(`  catalog ${upserted}/${steps.length}\r`);
      ops = [];
    }
  }
  if (ops.length) {
    await catalog.bulkWrite(ops, { ordered: false });
    upserted += ops.length;
  }
  process.stdout.write("\n");

  const pruned = await catalog.deleteMany({ "sync.lastSeenRunId": { $ne: runId } });

  await catalog.createIndex({ puzzleId: 1 }, { unique: true, background: true });
  await catalog.createIndex({ active: 1, "meta.variantId": 1, "rating.value": 1 }, { background: true });
  await catalog.createIndex({ bookId: 1, lessonId: 1, "meta.variantId": 1, active: 1 }, { background: true });

  return { upserted, pruned: pruned.deletedCount };
}

async function run() {
  const baseUri = process.env.MONGO_URI;
  if (!baseUri) throw new Error("MONGO_URI missing");

  const { ownerType, ownerId, sourceDb, targetDb, bookId, limit, titleContains, write, puzzlesOnly, lessonsOnly } =
    parseFlags();
  const ownerFilter = { ownerType, ownerId };
  const nowIso = new Date().toISOString();
  const runId = `sync:${Date.now()}`;

  function dbUri(dbName) {
    const q = baseUri.indexOf("?");
    const base = q >= 0 ? baseUri.slice(0, q) : baseUri;
    const qs = q >= 0 ? baseUri.slice(q) : "";
    const p = base.indexOf("://");
    const slash = base.indexOf("/", p + 3);
    return slash < 0 ? `${base}/${dbName}${qs}` : `${base.slice(0, slash)}/${dbName}${qs}`;
  }

  const client = new MongoClient(baseUri);
  await client.connect();

  try {
    const srcBooks = client.db(sourceDb).collection("books");
    const srcLessons = client.db(sourceDb).collection("lessons");
    const srcSteps = client.db(sourceDb).collection("steps");
    const tgtBooks = client.db(targetDb).collection("books");
    const tgtLessons = client.db(targetDb).collection("lessons");
    const tgtSteps = client.db(targetDb).collection("steps");
    const catalog = client.db(targetDb).collection("puzzle_catalog");

    const bookQuery = puzzlesOnly
      ? { ...ownerFilter, isDeleted: { $ne: true }, tags: "puzzels-import" }
      : lessonsOnly
      ? { ...ownerFilter, $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }], tags: { $ne: "puzzels-import" } }
      : { ...ownerFilter, $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };

    const sourceBooksAll = await srcBooks
      .find(bookQuery)
      .sort({ updatedAt: -1, createdAt: -1, title: 1, id: 1 })
      .toArray();
    const sourceBooksFiltered = sourceBooksAll.filter((b) => {
      const resolvedBookId = (b.bookId || b.id || "").toString();
      if (bookId && resolvedBookId !== bookId) return false;
      if (titleContains) {
        const title =
          typeof b.title === "string"
            ? b.title
            : typeof b.title?.nl === "string"
            ? b.title.nl
            : typeof b.title?.en === "string"
            ? b.title.en
            : "";
        if (!title.toLowerCase().includes(titleContains)) return false;
      }
      return true;
    });
    const sourceBooks = limit ? sourceBooksFiltered.slice(0, limit) : sourceBooksFiltered;
    const sourceBookIds = sourceBooks.map((b) => b.bookId || b.id).filter(Boolean);

    const lessonQuery = { ...ownerFilter, bookId: { $in: sourceBookIds }, isDeleted: { $ne: true } };
    const stepQuery = { ...ownerFilter, bookId: { $in: sourceBookIds }, isDeleted: { $ne: true } };

    const sourceLessons = sourceBookIds.length ? await srcLessons.find(lessonQuery).toArray() : [];
    const sourceSteps = sourceBookIds.length ? await srcSteps.find(stepQuery).toArray() : [];

    const mode = puzzlesOnly ? "puzzles-only" : lessonsOnly ? "lessons-only" : "all";
    console.log(
      `[sync] source=${sourceDb} target=${targetDb} owner=${ownerType}:${ownerId} write=${write} mode=${mode} bookId=${bookId || "-"} limit=${limit ?? "-"} titleContains=${titleContains || "-"}`
    );
    console.log(`[sync] sourceBooks=${sourceBooks.length} sourceLessons=${sourceLessons.length} sourceSteps=${sourceSteps.length}`);
    if (sourceBooks.length > 0) {
      console.log("[sync] selected books:");
      sourceBooks.forEach((b, i) => {
        const resolvedTitle =
          typeof b.title === "string"
            ? b.title
            : typeof b.title?.nl === "string"
            ? b.title.nl
            : typeof b.title?.en === "string"
            ? b.title.en
            : "(untitled)";
        console.log(`  ${i + 1}. ${(b.bookId || b.id || "").toString()} :: ${resolvedTitle}`);
      });
    }

    if (!write) {
      console.log("[sync] dry-run — pass --write to apply");
      return;
    }

    // ── Upsert books ─────────────────────────────────────────────────────────
    console.log("Upserting books...");
    await upsertBatch(tgtBooks, sourceBooks, "bookId");

    // Prune books removed from source (scoped to the synced set)
    const tgtBookExtraFilter = puzzlesOnly
      ? { tags: "puzzels-import" }
      : lessonsOnly
      ? { tags: { $ne: "puzzels-import" } }
      : {};
    const prunedBooks = await pruneRemoved(tgtBooks, ownerFilter, sourceBookIds, "bookId", tgtBookExtraFilter);
    if (prunedBooks) console.log(`  pruned ${prunedBooks} removed books`);

    // ── Upsert lessons ────────────────────────────────────────────────────────
    console.log("Upserting lessons...");
    const sourceLessonIds = sourceLessons.map((l) => l.lessonId || l.id).filter(Boolean);
    await upsertBatch(tgtLessons, sourceLessons, "lessonId");

    const prunedLessons = await pruneRemoved(tgtLessons, ownerFilter, sourceLessonIds, "lessonId", { bookId: { $in: sourceBookIds } });
    if (prunedLessons) console.log(`  pruned ${prunedLessons} removed lessons`);

    // ── Upsert steps ──────────────────────────────────────────────────────────
    console.log("Upserting steps...");
    const sourceStepIds = sourceSteps.map((s) => s.stepId || s.id).filter(Boolean);
    await upsertBatch(tgtSteps, sourceSteps, "stepId");

    const prunedSteps = await pruneRemoved(tgtSteps, ownerFilter, sourceStepIds, "stepId", { bookId: { $in: sourceBookIds } });
    if (prunedSteps) console.log(`  pruned ${prunedSteps} removed steps`);

    // ── Rebuild puzzle_catalog ────────────────────────────────────────────────
    const puzzleSteps = puzzlesOnly
      ? sourceSteps
      : sourceSteps.filter((s) => Array.isArray(s.tags) && s.tags.includes("imported"));

    if (puzzleSteps.length > 0) {
      console.log(`Rebuilding puzzle_catalog (${puzzleSteps.length} puzzle steps)...`);
      const { upserted, pruned } = await rebuildCatalog(catalog, puzzleSteps, ownerId, nowIso, runId);
      console.log(`  catalog upserted=${upserted} pruned=${pruned}`);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const [tgtBookCount, tgtLessonCount, tgtStepCount, catalogCount] = await Promise.all([
      tgtBooks.countDocuments(ownerFilter),
      tgtLessons.countDocuments(ownerFilter),
      tgtSteps.countDocuments(ownerFilter),
      catalog.countDocuments({ active: true }),
    ]);
    console.log(`[sync] done targetBooks=${tgtBookCount} targetLessons=${tgtLessonCount} targetSteps=${tgtStepCount} catalogActive=${catalogCount}`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error(`[sync] fatal ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
