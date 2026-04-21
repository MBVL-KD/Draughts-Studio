const connectMongo = require("../config/mongo");
const { BookModel } = require("../models/BookModel");

async function run() {
  await connectMongo();

  const result = await BookModel.updateMany(
    {},
    {
      $set: {
        accessModel: "free",
        unlockRules: { type: "none" },
      },
      $setOnInsert: {
        sequenceIndex: 9999,
      },
    }
  );

  // Only patch sequenceIndex when missing/null to avoid changing existing order.
  const seqFix = await BookModel.updateMany(
    {
      $or: [{ sequenceIndex: { $exists: false } }, { sequenceIndex: null }],
    },
    {
      $set: { sequenceIndex: 9999 },
    }
  );

  // Lessons without isExam should be treated as false. Optional backfill for consistency.
  const books = await BookModel.find({}).lean();
  let lessonFixCount = 0;
  for (const book of books) {
    const lessons = Array.isArray(book.lessons) ? book.lessons : [];
    let changed = false;
    const nextLessons = lessons.map((lesson) => {
      if (!lesson || typeof lesson !== "object") return lesson;
      if (Object.prototype.hasOwnProperty.call(lesson, "isExam")) return lesson;
      changed = true;
      return { ...lesson, isExam: false };
    });
    if (!changed) continue;
    lessonFixCount += 1;
    await BookModel.updateOne({ _id: book._id }, { $set: { lessons: nextLessons } });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        sequenceFixed: seqFix.modifiedCount,
        lessonBooksFixed: lessonFixCount,
      },
      null,
      2
    )
  );
  process.exit(0);
}

run().catch((error) => {
  console.error("backfillBookAccessDefaults failed:", error);
  process.exit(1);
});
