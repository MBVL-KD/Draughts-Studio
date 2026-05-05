import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { migrateBookToLatest, migrateSourceToLatest } from "../migrations";
import { BookModel } from "../models/BookModel";
import { SourceModel } from "../models/SourceModel";
import { getBookAppId, getSourceAppId } from "../utils/idResolvers";

type Counters = {
  scanned: number;
  migrated: number;
  unchanged: number;
  failed: number;
};

function parseFlags() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const dryRun = !write || args.includes("--dry-run");
  return { write, dryRun };
}

async function migrateBooks(write: boolean): Promise<Counters> {
  const counters: Counters = { scanned: 0, migrated: 0, unchanged: 0, failed: 0 };
  const books = await BookModel.find({}).lean();
  for (const book of books) {
    counters.scanned += 1;
    const appId = getBookAppId(book as { bookId?: string; id?: string }) || "(unknown-book-id)";
    try {
      const report = migrateBookToLatest(book as Record<string, unknown>);
      if (report.changed) {
        counters.migrated += 1;
        if (write) {
          await BookModel.updateOne({ _id: (book as { _id: unknown })._id }, { $set: report.document });
        }
      } else {
        counters.unchanged += 1;
      }
    } catch (error) {
      counters.failed += 1;
      console.error(
        `[migrate] failed kind=book appId=${appId} error=${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return counters;
}

async function migrateSources(write: boolean): Promise<Counters> {
  const counters: Counters = { scanned: 0, migrated: 0, unchanged: 0, failed: 0 };
  const sources = await SourceModel.find({}).lean();
  for (const source of sources) {
    counters.scanned += 1;
    const appId =
      getSourceAppId(source as { sourceId?: string; id?: string }) || "(unknown-source-id)";
    try {
      const report = migrateSourceToLatest(source as Record<string, unknown>);
      if (report.changed) {
        counters.migrated += 1;
        if (write) {
          await SourceModel.updateOne(
            { _id: (source as { _id: unknown })._id },
            { $set: report.document }
          );
        }
      } else {
        counters.unchanged += 1;
      }
    } catch (error) {
      counters.failed += 1;
      console.error(
        `[migrate] failed kind=source appId=${appId} error=${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return counters;
}

async function run() {
  const { write, dryRun } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI missing");
  }

  console.log(`[migrate] mode=${write ? "write" : "dry-run"} dryRun=${dryRun}`);
  await connectMongo(uri);

  try {
    const bookCounters = await migrateBooks(write);
    const sourceCounters = await migrateSources(write);

    console.log("[migrate] summary books", bookCounters);
    console.log("[migrate] summary sources", sourceCounters);
  } finally {
    await disconnectMongo();
  }
}

run().catch((error) => {
  console.error(`[migrate] fatal error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

