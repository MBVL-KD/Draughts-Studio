import "dotenv/config";
import { randomUUID } from "crypto";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { LessonModel } from "../models/LessonModel";
import { StepModel } from "../models/StepModel";

const PUZZELS_TAG = "puzzels-import";
const MAX_STEPS_PER_LESSON = 140;
const MAX_STEPS_PER_BOOK = 280;

type AnyRec = Record<string, unknown>;

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((arg) => arg.startsWith("--ownerType="));
  const ownerIdArg = args.find((arg) => arg.startsWith("--ownerId="));
  return {
    write: args.includes("--write"),
    ownerType: ownerTypeArg?.slice("--ownerType=".length).trim() || undefined,
    ownerId: ownerIdArg?.slice("--ownerId=".length).trim() || undefined,
  };
}

function splitArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function puzzleBookTitleAtIndex(index: number): AnyRec {
  const suffix = index <= 0 ? "" : ` ${index + 1}`;
  return { values: { en: `Puzzles${suffix}`, nl: `Puzzels${suffix}` } };
}

function maxSequenceIndex(books: AnyRec[]): number {
  let max = 0;
  for (const book of books) {
    const n = Number(book.sequenceIndex);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

async function run() {
  const { write, ownerType, ownerId } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await connectMongo(uri);
  try {
    const ownerFilter = ownerType && ownerId ? { ownerType, ownerId } : {};
    const books = (await BookModel.find({
      ...ownerFilter,
      isDeleted: false,
      tags: { $in: [PUZZELS_TAG] },
    }).lean()) as unknown as AnyRec[];

    const grouped = new Map<string, AnyRec[]>();
    for (const book of books) {
      const key = `${book.ownerType}:${book.ownerId}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(book);
      grouped.set(key, bucket);
    }

    console.log(
      `[split-puzzels] mode=${write ? "write" : "dry-run"} owners=${grouped.size} books=${books.length}`
    );

    for (const ownerBooks of grouped.values()) {
      await processOwner(ownerBooks, write);
    }
  } finally {
    await disconnectMongo();
  }
}

async function processOwner(ownerBooks: AnyRec[], write: boolean) {
  const first = ownerBooks[0];
  const ownerCtx = { ownerType: String(first.ownerType ?? ""), ownerId: String(first.ownerId ?? "") };
  const ownerKey = `${ownerCtx.ownerType}:${ownerCtx.ownerId}`;

  // Load all lessons for these books
  const bookIds = ownerBooks.map((b) => String(b.bookId ?? "")).filter(Boolean);
  const lessons = (await LessonModel.find({
    ...ownerCtx,
    isDeleted: false,
    bookId: { $in: bookIds },
  }).lean()) as unknown as AnyRec[];

  // Split oversized lessons
  const splitLessons: AnyRec[] = [];
  for (const lesson of lessons) {
    const stepIds = Array.isArray(lesson.stepIds) ? (lesson.stepIds as string[]) : [];
    if (stepIds.length <= MAX_STEPS_PER_LESSON) {
      splitLessons.push(lesson);
      continue;
    }
    // Lesson is too large — split into chunks
    const chunks = splitArray(stepIds, MAX_STEPS_PER_LESSON);
    for (let partIdx = 0; partIdx < chunks.length; partIdx++) {
      const chunkIds = chunks[partIdx];
      splitLessons.push({
        ...lesson,
        lessonId: partIdx === 0 ? String(lesson.lessonId ?? "") : randomUUID(),
        stepIds: chunkIds,
        entryStepId: chunkIds[0] ?? null,
        _originalLessonId: String(lesson.lessonId ?? ""),
        _partIdx: partIdx,
      });
    }
  }

  // Bin lessons into books using step count
  const bins: AnyRec[][] = [];
  for (const lesson of splitLessons) {
    const lessonSteps = Array.isArray(lesson.stepIds) ? (lesson.stepIds as string[]).length : 0;
    let placed = false;
    for (const bin of bins) {
      const binSteps = bin.reduce(
        (sum, l) => sum + (Array.isArray(l.stepIds) ? (l.stepIds as string[]).length : 0),
        0
      );
      if (binSteps + lessonSteps <= MAX_STEPS_PER_BOOK) {
        bin.push(lesson);
        placed = true;
        break;
      }
    }
    if (!placed) bins.push([lesson]);
  }

  const baseSequence = maxSequenceIndex(ownerBooks);
  console.log(
    `[split-puzzels] owner=${ownerKey} booksBefore=${ownerBooks.length} lessonsBefore=${lessons.length} lessonsAfter=${splitLessons.length} binsAfter=${bins.length}`
  );

  if (!write) return;

  const sorted = [...ownerBooks].sort((a, b) =>
    String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""))
  );

  for (let i = 0; i < bins.length; i++) {
    const binLessons = bins[i];
    const lessonIds = binLessons.map((l) => String(l.lessonId ?? "")).filter(Boolean);
    const title = puzzleBookTitleAtIndex(i);
    const sequenceIndex = baseSequence + i + 1;

    const targetBook = sorted[i];
    if (targetBook) {
      const bookId = String(targetBook.bookId ?? "");
      const revision = Number(targetBook.revision ?? 1);
      await BookModel.updateOne(
        { _id: (targetBook as { _id: unknown })._id },
        {
          $set: {
            title,
            sequenceIndex,
            lessonIds,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            revision: revision + 1,
          },
        }
      );
      // Update lesson bookId references
      for (const lesson of binLessons) {
        const lessonId = String(lesson.lessonId ?? "");
        if (!lessonId) continue;
        await LessonModel.updateOne({ lessonId }, { $set: { bookId } });
        // If this is a split-off part (new UUID), update step bookIds
        if (lesson._partIdx && Number(lesson._partIdx) > 0) {
          const chunkIds = Array.isArray(lesson.stepIds) ? (lesson.stepIds as string[]) : [];
          if (chunkIds.length > 0) {
            await StepModel.updateMany({ stepId: { $in: chunkIds } }, { $set: { bookId, lessonId } });
          }
        }
      }
    } else {
      const bookId = randomUUID();
      await BookModel.create({
        ...ownerCtx,
        id: bookId,
        bookId,
        title,
        sequenceIndex,
        lessonIds,
        tags: [PUZZELS_TAG],
        status: first.status ?? "draft",
        unlockRules: { type: "none" },
        accessModel: "free",
        productId: "",
        revision: 1,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        schemaVersion: 2,
      });
      for (const lesson of binLessons) {
        const lessonId = String(lesson.lessonId ?? "");
        if (!lessonId) continue;
        await LessonModel.updateOne({ lessonId }, { $set: { bookId } });
      }
    }
  }

  // Soft-delete excess books
  const now = new Date().toISOString();
  for (let i = bins.length; i < sorted.length; i++) {
    await BookModel.updateOne(
      { _id: (sorted[i] as { _id: unknown })._id },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          deletedBy: "splitLargePuzzelsBooks",
          revision: Number(sorted[i].revision ?? 1) + 1,
        },
      }
    );
  }
}

run().catch((error) => {
  console.error(`[split-puzzels] fatal ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
