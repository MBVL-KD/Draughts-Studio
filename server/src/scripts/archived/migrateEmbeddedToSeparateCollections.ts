/**
 * One-time migration: extracts embedded lessons and steps from the books collection
 * into the new separate lessons and steps collections.
 *
 * Run with --write to persist changes. Default is dry-run (no writes).
 *
 * Idempotent: lessons/steps already in their target collections are skipped (upsert).
 */
import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { LessonModel } from "../models/LessonModel";
import { StepModel } from "../models/StepModel";

type AnyRec = Record<string, unknown>;

type Counters = {
  booksScanned: number;
  booksUpdated: number;
  lessonsCreated: number;
  stepsCreated: number;
  failed: number;
};

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((a) => a.startsWith("--ownerType="));
  const ownerIdArg = args.find((a) => a.startsWith("--ownerId="));
  return {
    write: args.includes("--write"),
    ownerType: ownerTypeArg?.slice("--ownerType=".length).trim(),
    ownerId: ownerIdArg?.slice("--ownerId=".length).trim(),
  };
}

function idOf(doc: AnyRec, key: string): string {
  const v = doc[key] ?? doc.id ?? "";
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

async function migrateBook(book: AnyRec, write: boolean, counters: Counters): Promise<void> {
  const bookId = idOf(book, "bookId");
  const ownerType = String(book.ownerType ?? "");
  const ownerId = String(book.ownerId ?? "");
  const owner = { ownerType, ownerId };

  const embeddedLessons = Array.isArray(book.lessons) ? (book.lessons as AnyRec[]) : [];
  if (embeddedLessons.length === 0) return; // nothing to migrate

  const lessonIds: string[] = [];

  for (const lesson of embeddedLessons) {
    const lessonId = idOf(lesson, "lessonId");
    if (!lessonId) {
      console.warn(`[migrate] book=${bookId} skipping lesson with no lessonId`);
      continue;
    }

    // ── Collect step documents ────────────────────────────────────────────────
    const bundle = (lesson.authoringV2 as AnyRec | undefined) ?? {};
    const authoringLesson = (bundle.authoringLesson as AnyRec | undefined) ?? {};
    const stepsById = (bundle.stepsById as Record<string, AnyRec> | undefined) ?? {};

    const authoringStepIds: string[] = Array.isArray(authoringLesson.stepIds)
      ? (authoringLesson.stepIds as string[]).filter((id): id is string => typeof id === "string" && !!id)
      : Object.keys(stepsById);

    // Fall back to legacy steps[] if no authoring bundle
    const legacySteps = Array.isArray(lesson.steps) ? (lesson.steps as AnyRec[]) : [];
    const legacyStepById = new Map<string, AnyRec>(
      legacySteps.map((s) => [idOf(s, "stepId"), s])
    );

    const stepIds: string[] = [];

    // Prefer v2 authoring steps (stepsById) — they carry timeline data
    if (authoringStepIds.length > 0) {
      for (let idx = 0; idx < authoringStepIds.length; idx++) {
        const stepId = authoringStepIds[idx];
        if (!stepId) continue;
        const aStep = stepsById[stepId];
        if (!aStep) {
          console.warn(`[migrate] book=${bookId} lesson=${lessonId} stepId=${stepId} not found in stepsById — skipping`);
          continue;
        }

        const stepDoc: AnyRec = {
          ...aStep,
          id: stepId,
          stepId,
          lessonId,
          bookId,
          orderIndex: idx,
          ownerType,
          ownerId,
          isDeleted: false,
          revision: 1,
        };

        stepIds.push(stepId);

        if (write) {
          await StepModel.findOneAndUpdate(
            { ownerType, ownerId, stepId },
            { $setOnInsert: stepDoc },
            { upsert: true }
          );
        }
        counters.stepsCreated += 1;
      }
    } else if (legacySteps.length > 0) {
      // No authoring bundle — migrate v1 legacy steps as-is
      for (let idx = 0; idx < legacySteps.length; idx++) {
        const lStep = legacySteps[idx];
        if (!lStep) continue;
        const stepId = idOf(lStep, "stepId");
        if (!stepId) continue;

        const stepDoc: AnyRec = {
          ...lStep,
          id: stepId,
          stepId,
          lessonId,
          bookId,
          orderIndex: idx,
          ownerType,
          ownerId,
          isDeleted: false,
          revision: 1,
        };

        stepIds.push(stepId);

        if (write) {
          await StepModel.findOneAndUpdate(
            { ownerType, ownerId, stepId },
            { $setOnInsert: stepDoc },
            { upsert: true }
          );
        }
        counters.stepsCreated += 1;
      }
    }

    // ── Create lesson document ────────────────────────────────────────────────
    const entryStepId =
      typeof authoringLesson.entryStepId === "string"
        ? authoringLesson.entryStepId
        : stepIds[0] ?? null;

    const branchesById = bundle.branchesById ?? undefined;

    const lessonDoc: AnyRec = {
      id: lessonId,
      lessonId,
      bookId,
      ownerType,
      ownerId,
      stepIds,
      entryStepId,
      ...(branchesById ? { branchesById } : {}),
      title: lesson.title ?? { values: { en: "" } },
      description: lesson.description,
      isExam: lesson.isExam ?? false,
      examConfig: lesson.examConfig,
      variantId: lesson.variantId ?? "international",
      rulesetId: lesson.rulesetId,
      difficulty: lesson.difficulty,
      estimatedMinutes: lesson.estimatedMinutes ?? lesson.estimatedDurationMin,
      rewards: lesson.rewards,
      isDeleted: false,
      revision: 1,
    };

    lessonIds.push(lessonId);

    if (write) {
      await LessonModel.findOneAndUpdate(
        { ownerType, ownerId, lessonId },
        { $setOnInsert: lessonDoc },
        { upsert: true }
      );
    }
    counters.lessonsCreated += 1;
  }

  // ── Update book: set lessonIds[], remove embedded lessons ─────────────────
  // Use native driver for $unset — Mongoose strict mode ignores $unset of fields
  // not present in the schema (lessons/exams were removed in v2).
  if (write && lessonIds.length > 0) {
    const nativeCollection = BookModel.collection;
    await nativeCollection.updateOne(
      { _id: (book as { _id: unknown })._id as import("mongoose").Types.ObjectId },
      {
        $set: { lessonIds },
        $unset: { lessons: "", exams: "" },
      }
    );
  }

  counters.booksUpdated += 1;
  console.log(
    `[migrate] book=${bookId} owner=${ownerType}:${ownerId} lessons=${lessonIds.length} steps=${lessonIds.length > 0 ? "see above" : 0}`
  );
}

async function run() {
  const { write, ownerType, ownerId } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");

  console.log(`[migrate-collections] mode=${write ? "WRITE" : "dry-run"}`);
  if (ownerType && ownerId) {
    console.log(`[migrate-collections] filtering owner=${ownerType}:${ownerId}`);
  }

  await connectMongo(uri);

  const counters: Counters = {
    booksScanned: 0,
    booksUpdated: 0,
    lessonsCreated: 0,
    stepsCreated: 0,
    failed: 0,
  };

  try {
    const ownerFilter = ownerType && ownerId ? { ownerType, ownerId } : {};
    // Only migrate books that still have embedded lessons
    const books = await BookModel.find({
      ...ownerFilter,
      "lessons.0": { $exists: true },
    }).lean();

    console.log(`[migrate-collections] found ${books.length} books with embedded lessons`);

    for (const book of books) {
      counters.booksScanned += 1;
      try {
        await migrateBook(book as AnyRec, write, counters);
      } catch (error) {
        counters.failed += 1;
        console.error(
          `[migrate-collections] failed bookId=${String((book as AnyRec).bookId ?? "")} error=${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } finally {
    await disconnectMongo();
  }

  console.log("[migrate-collections] summary", {
    mode: write ? "write" : "dry-run",
    ...counters,
  });

  if (!write && counters.booksScanned > 0) {
    console.log("\nRun with --write to apply changes.");
  }
}

run().catch((error) => {
  console.error(
    `[migrate-collections] fatal error=${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
