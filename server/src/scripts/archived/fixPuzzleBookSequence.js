require("dotenv/config");
const { MongoClient } = require("mongodb");

async function fix() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  try {
    for (const dbName of ["test", "kid_draughts"]) {
      const books = client.db(dbName).collection("books");
      const puzzleBooks = await books
        .find({ ownerType: "user", ownerId: "dev-user-1", tags: "puzzels-import" })
        .sort({ sequenceIndex: 1 })
        .toArray();
      console.log(`[${dbName}] found ${puzzleBooks.length} puzzle books`);
      for (let i = 0; i < puzzleBooks.length; i++) {
        const newSeq = 9000 + i;
        const book = puzzleBooks[i];
        const bookId = book.bookId || book.id;
        const oldSeq = book.sequenceIndex;
        await books.updateOne({ bookId }, { $set: { sequenceIndex: newSeq } });
        console.log(`  [${dbName}] ${bookId} (${book.title || "?"}): ${oldSeq} -> ${newSeq}`);
      }
    }
    console.log("Done.");
  } finally {
    await client.close();
  }
}

fix().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
