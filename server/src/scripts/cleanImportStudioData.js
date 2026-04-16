/**
 * Removes all Slagzet import jobs/items and the "Puzzels" import book(s).
 * Usage (from server/): node src/scripts/cleanImportStudioData.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

const PUZZELS_TAG = "puzzels-import";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI missing in server/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const rJobs = await db.collection("import_jobs").deleteMany({});
  const rItems = await db.collection("import_items").deleteMany({});
  const rBooks = await db.collection("books").deleteMany({
    tags: { $in: [PUZZELS_TAG] },
  });

  console.log("Clean import studio data:", {
    deletedImportJobs: rJobs.deletedCount,
    deletedImportItems: rItems.deletedCount,
    deletedPuzzelsBooks: rBooks.deletedCount,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
