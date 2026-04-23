import "dotenv/config";
import mongoose from "mongoose";
import { getImportAdapter } from "../import/adapters";
import { convertSlagzetItemToLessonStep } from "../import/normalize/slagzetToStep";
import { runImportScanAnalysis } from "../engine/importScan/runImportScanAnalysis";

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await mongoose.connect(uri);
  try {
    const owner = { ownerType: "user", ownerId: "dev-user-1" } as const;
    const jobId = "f4b9eb55-15b5-4934-b910-89b1b3eeaa56";
    const index = 567;

    const item = await mongoose.connection.collection("import_items").findOne({
      ...owner,
      jobId,
      index,
      isDeleted: { $ne: true },
    });
    if (!item) throw new Error(`Import item not found for index=${index}`);

    const adapter = getImportAdapter("slagzet");
    const scrapeStartedAt = Date.now();
    const scraped = await adapter.scrapeCollectionItem(String(item.fragmentUrl ?? ""));
    const scrapeMs = Date.now() - scrapeStartedAt;

    const normalizeStartedAt = Date.now();
    const step = convertSlagzetItemToLessonStep({
      job: {
        sourceType: "slagzet",
        sourceUrl: "",
        collectionSlug: "Gevorderd",
        collectionTitle: "Gevorderd",
        scanConfig: { enabled: true, multiPv: 1 },
      } as any,
      item: item as any,
      scrapedItem: scraped,
    });
    const normalizeMs = Date.now() - normalizeStartedAt;
    const fen = String(step?.initialState?.fen ?? "").trim();
    if (!fen) throw new Error("No FEN resolved from puzzle item");

    async function runDepth(depth: number) {
      const startedAt = Date.now();
      const result = await runImportScanAnalysis({
        variantId: "international",
        fen,
        depth,
        multiPv: 1,
      });
      return {
        depth,
        ms: Date.now() - startedAt,
        evaluation: result.evaluation,
        pvLength: Array.isArray(result.pv) ? result.pv.length : 0,
      };
    }

    const scans = [await runDepth(10), await runDepth(12), await runDepth(21)];
    console.log(
      JSON.stringify(
        {
          jobId,
          index,
          itemId: item.itemId,
          fragmentUrl: item.fragmentUrl,
          scrapeMs,
          normalizeMs,
          scans,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(
    `[single-puzzle-scan] fatal ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
