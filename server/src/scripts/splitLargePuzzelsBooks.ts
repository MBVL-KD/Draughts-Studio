import "dotenv/config";
import { randomUUID } from "crypto";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { getBookAppId, getLessonAppId, getStepAppId } from "../utils/idResolvers";
import { syncLegacyStepsFromAuthoringBundle } from "../import/normalize/legacyImportStepToAuthoringV2";

const PUZZELS_TAG = "puzzels-import";
const MAX_STEPS_PER_LESSON = 220;
const MAX_STEPS_PER_BOOK = 900;
const MAX_BOOK_BYTES = 1_200_000;

type AnyRec = Record<string, unknown>;
type BookDocLike = AnyRec & {
  _id: unknown;
  ownerType?: string;
  ownerId?: string;
  title?: AnyRec;
  description?: AnyRec;
  lessons?: AnyRec[];
  tags?: string[];
  revision?: number;
  status?: string;
  schemaVersion?: number;
  archivedAt?: string | null;
};

function toFiniteSequenceIndex(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function maxSequenceIndex(books: BookDocLike[]): number {
  let max = 0;
  for (const book of books) {
    const seq = toFiniteSequenceIndex(book.sequenceIndex);
    if (seq !== null && seq > max) max = seq;
  }
  return max;
}

function parseFlags() {
  const args = process.argv.slice(2);
  const ownerTypeArg = args.find((arg) => arg.startsWith("--ownerType="));
  const ownerIdArg = args.find((arg) => arg.startsWith("--ownerId="));
  const ownerType = ownerTypeArg ? ownerTypeArg.slice("--ownerType=".length).trim() : "";
  const ownerId = ownerIdArg ? ownerIdArg.slice("--ownerId=".length).trim() : "";
  return {
    write: args.includes("--write"),
    ownerType: ownerType || undefined,
    ownerId: ownerId || undefined,
  };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function lessonStepIdsFromLegacy(lesson: AnyRec): string[] {
  const steps = Array.isArray(lesson.steps) ? (lesson.steps as AnyRec[]) : [];
  return steps.map((s) => getStepAppId(s)).filter((id) => typeof id === "string" && id.length > 0);
}

function splitArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildPartTitle(baseLabel: string, part: number): string {
  return part <= 1 ? baseLabel : `${baseLabel} (part ${part})`;
}

function lessonTitleLabel(lesson: AnyRec): string {
  const values = (lesson.title as AnyRec | undefined)?.values as AnyRec | undefined;
  return normalizeText(values?.nl ?? values?.en ?? "Collectie");
}

function cloneLessonChunk(lesson: AnyRec, stepIds: string[], part: number): AnyRec {
  const lessonId = randomUUID();
  const baseLabel = lessonTitleLabel(lesson).replace(/\s+\(part\s+\d+\)$/i, "");
  const partLabel = buildPartTitle(baseLabel, part);
  const values = {
    en: partLabel,
    nl: partLabel,
  };

  const bundle = lesson.authoringV2 as AnyRec | undefined;
  const authoringLesson = (bundle?.authoringLesson as AnyRec | undefined) ?? undefined;
  const stepsById = (bundle?.stepsById as AnyRec | undefined) ?? undefined;

  if (authoringLesson && stepsById) {
    const filteredStepsById: AnyRec = {};
    for (const sid of stepIds) {
      if (stepsById[sid]) filteredStepsById[sid] = stepsById[sid];
    }
    const nextBundle: AnyRec = {
      ...bundle,
      authoringLesson: {
        ...authoringLesson,
        id: lessonId,
        stepIds: stepIds,
        entryStepId: stepIds[0] ?? null,
        title: { values },
      },
      stepsById: filteredStepsById,
    };
    const syncedSteps = syncLegacyStepsFromAuthoringBundle(nextBundle);
    return {
      ...lesson,
      id: lessonId,
      lessonId,
      title: { values },
      authoringV2: nextBundle,
      steps: syncedSteps,
    };
  }

  const legacy = Array.isArray(lesson.steps) ? (lesson.steps as AnyRec[]) : [];
  const allowed = new Set(stepIds);
  const steps = legacy.filter((s) => allowed.has(getStepAppId(s)));
  return {
    ...lesson,
    id: lessonId,
    lessonId,
    title: { values },
    steps,
  };
}

function splitLessonIfNeeded(lesson: AnyRec): AnyRec[] {
  const bundle = lesson.authoringV2 as AnyRec | undefined;
  const authoringStepIds = Array.isArray((bundle?.authoringLesson as AnyRec | undefined)?.stepIds)
    ? (((bundle!.authoringLesson as AnyRec).stepIds as unknown[]) as string[])
    : null;
  const stepIds = authoringStepIds ?? lessonStepIdsFromLegacy(lesson);
  if (stepIds.length <= MAX_STEPS_PER_LESSON) {
    return [{ ...lesson }];
  }
  const chunks = splitArray(stepIds, MAX_STEPS_PER_LESSON);
  return chunks.map((chunk, index) => cloneLessonChunk(lesson, chunk, index + 1));
}

function countLessonSteps(lesson: AnyRec): number {
  const bundle = lesson.authoringV2 as AnyRec | undefined;
  const stepIds = (bundle?.authoringLesson as AnyRec | undefined)?.stepIds;
  if (Array.isArray(stepIds)) return stepIds.length;
  return Array.isArray(lesson.steps) ? lesson.steps.length : 0;
}

function estimateBookBytes(template: AnyRec, lessons: AnyRec[]): number {
  const payload = {
    ...template,
    lessons,
  };
  return Buffer.byteLength(JSON.stringify(payload));
}

function puzzleBookTitleAtIndex(index: number): AnyRec {
  const suffix = index <= 0 ? "" : ` ${index + 1}`;
  return {
    values: {
      en: `Puzzles${suffix}`,
      nl: `Puzzels${suffix}`,
    },
  };
}

function buildBins(lessons: AnyRec[], template: AnyRec): AnyRec[][] {
  const bins: AnyRec[][] = [];
  for (const lesson of lessons) {
    const lessonSteps = countLessonSteps(lesson);
    let placed = false;
    for (const bin of bins) {
      const steps = bin.reduce((sum, l) => sum + countLessonSteps(l), 0);
      if (steps + lessonSteps > MAX_STEPS_PER_BOOK) continue;
      const bytes = estimateBookBytes(template, [...bin, lesson]);
      if (bytes > MAX_BOOK_BYTES) continue;
      bin.push(lesson);
      placed = true;
      break;
    }
    if (!placed) bins.push([lesson]);
  }
  return bins;
}

async function processOwnerBooks(ownerBooks: BookDocLike[], write: boolean) {
  const sorted = [...ownerBooks].sort((a, b) => {
    const aa = String((a as AnyRec).updatedAt ?? "");
    const bb = String((b as AnyRec).updatedAt ?? "");
    return aa.localeCompare(bb);
  });
  const first = sorted[0];
  const allLessons = sorted.flatMap((book) =>
    Array.isArray(book.lessons) ? (book.lessons as AnyRec[]) : []
  );
  const splitLessons = allLessons.flatMap((lesson) => splitLessonIfNeeded(lesson));

  const template: AnyRec = {
    ownerType: first.ownerType,
    ownerId: first.ownerId,
    schemaVersion: 1,
    description: first.description ?? {
      values: {
        en: "Imported puzzles (Slagzet).",
        nl: "Geimporteerde puzzels (Slagzet).",
      },
    },
    tags: [PUZZELS_TAG],
    status: first.status ?? "draft",
    exams: [],
    unlockRules: { type: "none" },
    accessModel: "free",
    productId: "",
    shopTag: "",
  };

  const bins = buildBins(splitLessons, template);
  const baseSequence = maxSequenceIndex(sorted);
  const ownerKey = `${first.ownerType}:${first.ownerId}`;
  console.log(
    `[split-puzzels] owner=${ownerKey} booksBefore=${sorted.length} lessonsBefore=${allLessons.length} lessonsAfter=${splitLessons.length} booksAfter=${bins.length} baseSequence=${baseSequence}`
  );

  if (!write) return;

  for (let i = 0; i < bins.length; i += 1) {
    const lessons = bins[i];
    const targetExisting = sorted[i];
    const title = puzzleBookTitleAtIndex(i);
    const sequenceIndex = baseSequence + i + 1;
    if (targetExisting) {
      const revision = Number(targetExisting.revision ?? 1);
      await BookModel.updateOne(
        { _id: targetExisting._id },
        {
          $set: {
            ...template,
            id: getBookAppId(targetExisting as AnyRec),
            bookId: getBookAppId(targetExisting as AnyRec),
            title,
            sequenceIndex,
            lessons,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            revision: revision + 1,
          },
        }
      );
      continue;
    }

    const bookId = randomUUID();
    await BookModel.create({
      ...template,
      id: bookId,
      bookId,
      title,
      sequenceIndex,
      lessons,
      revision: 1,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  if (sorted.length > bins.length) {
    const now = new Date().toISOString();
    for (let i = bins.length; i < sorted.length; i += 1) {
      await BookModel.updateOne(
        { _id: sorted[i]._id },
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
}

async function run() {
  const { write, ownerType, ownerId } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await connectMongo(uri);
  try {
    const ownerFilter =
      ownerType && ownerId
        ? {
            ownerType,
            ownerId,
          }
        : {};
    const books = (await BookModel.find({
      ...ownerFilter,
      isDeleted: false,
      tags: { $in: [PUZZELS_TAG] },
    }).lean()) as unknown as BookDocLike[];

    const grouped = new Map<string, BookDocLike[]>();
    for (const book of books) {
      const key = `${book.ownerType}:${book.ownerId}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(book);
      grouped.set(key, bucket);
    }

    console.log(
      `[split-puzzels] mode=${write ? "write" : "dry-run"} owners=${grouped.size} books=${books.length} ownerFilter=${ownerType ?? "*"}:${ownerId ?? "*"}`
    );

    for (const ownerBooks of grouped.values()) {
      await processOwnerBooks(ownerBooks, write);
    }
  } finally {
    await disconnectMongo();
  }
}

run().catch((error) => {
  console.error(
    `[split-puzzels] fatal ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});

