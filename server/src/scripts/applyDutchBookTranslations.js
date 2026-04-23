const mongoose = require("mongoose");
const connectMongo = require("../config/mongo");

const BOOK_TRANSLATIONS = {
  "26d72f81-6bf3-47a3-ad9f-a3ec658ff865": {
    enTitle: "Level 4",
    lessons: {
      0: { enTitle: "Level 4A Exam", enDescription: "THE FIRST EXAM FOR LEVEL 4" },
      1: { enTitle: "Level 4B Exam", enDescription: "THE SECOND EXAM FOR LEVEL 4" },
    },
  },
  "b9d06a10-4b8c-4ed5-a2ac-8f64e75d9b61": {
    enTitle: "Level 5",
    lessons: {
      0: { enTitle: "Level 5 Exam", enDescription: "THE FIRST EXAM FOR LEVEL 5" },
      1: { enTitle: "Level 5B Exam", enDescription: "THE SECOND EXAM FOR LEVEL 5" },
    },
  },
  "8d42ec79-b8a4-40b0-905e-9c39e4d0d7af": {
    enTitle: "Level 3",
    lessons: {
      0: { enTitle: "Level 3A Exam", enDescription: "THE FIRST EXAM FOR LEVEL 3" },
      1: { enTitle: "Level 3B Exam", enDescription: "THE SECOND EXAM FOR LEVEL 3" },
    },
  },
  "de7135fc-6cfe-4ed3-9b2c-dcb56ec03072": {
    enTitle: "Level 2",
    lessons: {
      0: { enTitle: "Level 2A Exam", enDescription: "THE FIRST EXAM FOR LEVEL 2" },
      1: { enTitle: "Level 2B Exam", enDescription: "THE SECOND EXAM FOR LEVEL 2" },
    },
  },
  "4787a340-37ec-4858-99ad-7c9ea01e2834": {
    enTitle: "Combinations 1",
    lessons: {
      0: { enTitle: "Combinations 1 Exam" },
    },
  },
  "024a320f-078f-4108-8ca5-b54cdb684e71": {
    enTitle: "Level 1",
    lessons: {
      0: { enTitle: "Level 1 Exam" },
    },
  },
  "82c48eb4-3ed8-4d6f-a346-bd5fde0b7f3d": {
    enTitle: "The First Move",
    lessons: {
      0: { enTitle: "The First Move Exam", enDescription: "THE EXAM FOR THE FIRST MOVE" },
    },
  },
  "51c40495-21a9-417a-873f-3a1499e6208d": {
    enTitle: "The Second Move",
    lessons: {
      0: { enTitle: "The Second Move Exam", enDescription: "The Exam for the Second Move" },
    },
  },
  "399fa633-ef2d-4ed2-82c3-6f1d93498797": {
    enTitle: "Combinations 2",
  },
  "bdd5789b-0ff2-41f8-8158-f1eff70ca508": {
    enTitle: "Puzzles",
    enDescription: "Imported puzzles (Slagzet). Each lesson is a collection.",
    lessons: {
      1: { enTitle: "Capture of the Day" },
    },
  },
};

function asLocalizedText(value) {
  const values = value && typeof value === "object" && value.values && typeof value.values === "object"
    ? { ...value.values }
    : {};
  return { values };
}

function withEnglishText(value, enText) {
  const localized = asLocalizedText(value);
  localized.values.en = enText;
  return localized;
}

async function run() {
  await connectMongo();
  const bookIds = Object.keys(BOOK_TRANSLATIONS);
  const books = await mongoose.connection.collection("books").find({ bookId: { $in: bookIds } }).toArray();

  let updatedBooks = 0;
  let touchedLessons = 0;

  for (const book of books) {
    const config = BOOK_TRANSLATIONS[book.bookId];
    if (!config) continue;

    let changed = false;
    if (config.enTitle) {
      book.title = withEnglishText(book.title, config.enTitle);
      changed = true;
    }
    if (config.enDescription) {
      book.description = withEnglishText(book.description, config.enDescription);
      changed = true;
    }

    if (config.lessons && Array.isArray(book.lessons)) {
      for (const [indexStr, lessonConfig] of Object.entries(config.lessons)) {
        const index = Number(indexStr);
        const lesson = book.lessons[index];
        if (!lesson || typeof lesson !== "object") continue;
        if (lessonConfig.enTitle) {
          lesson.title = withEnglishText(lesson.title, lessonConfig.enTitle);
          changed = true;
          touchedLessons += 1;
        }
        if (lessonConfig.enDescription) {
          lesson.description = withEnglishText(lesson.description, lessonConfig.enDescription);
          changed = true;
        }
      }
    }

    if (changed) {
      await mongoose.connection.collection("books").updateOne(
        { _id: book._id },
        { $set: { title: book.title, description: book.description, lessons: book.lessons } }
      );
      updatedBooks += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        requestedBookIds: bookIds.length,
        matchedBooks: books.length,
        updatedBooks,
        touchedLessons,
      },
      null,
      2
    )
  );
  process.exit(0);
}

run().catch((error) => {
  console.error("applyDutchBookTranslations failed:", error);
  process.exit(1);
});
