import { randomUUID } from "crypto";
import { getBookById, listBooks, createBook, patchBook, appendLessonIdToBook } from "../repositories/bookRepository";
import {
  getLessonsByBookId,
  createLesson,
  appendStepIdToLesson,
  countLessonSteps,
  countBookSteps,
} from "../repositories/lessonRepository";
import { createStep } from "../repositories/stepRepository";
import { ConflictError, NotFoundError } from "../utils/httpErrors";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

export const PUZZELS_BOOK_TAG = "puzzels-import";

const MAX_STEPS_PER_LESSON = 140;
const MAX_STEPS_PER_BOOK = 280;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeCollectionTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200) || "Collectie";
}

function parseCollectionPartNumber(title: string, baseLabel: string): number {
  const normalized = normalizeText(title);
  if (!normalized) return -1;
  if (normalized === baseLabel) return 1;
  const escaped = baseLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = normalized.match(new RegExp(`^${escaped}\\s+\\(part\\s+(\\d+)\\)$`, "i"));
  if (!m) return -1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : -1;
}

function buildLessonTitle(baseLabel: string, part: number): string {
  return part <= 1 ? baseLabel : `${baseLabel} (part ${part})`;
}

function maxSequenceIndex(books: Record<string, unknown>[]): number {
  let max = 0;
  for (const book of books) {
    const n = Number(book.sequenceIndex);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

async function choosePuzzelsBook(owner: OwnerContext): Promise<Record<string, unknown>> {
  const books = (await listBooks(owner, { tag: PUZZELS_BOOK_TAG, limit: 200, sort: "updatedAt_desc" })) as unknown as Record<string, unknown>[];

  for (const book of books) {
    const bookId = String(book.bookId ?? book.id ?? "");
    if (!bookId) continue;
    const steps = await countBookSteps(owner, bookId);
    if (steps < MAX_STEPS_PER_BOOK) return book;
  }

  const nextSeq = maxSequenceIndex(books) + 1;
  const suffix = books.length >= 1 ? ` ${books.length + 1}` : "";
  const bookId = randomUUID();
  const created = await createBook(owner, {
    id: bookId,
    bookId,
    schemaVersion: 1,
    revision: 1,
    title: { values: { en: `Puzzles${suffix}`, nl: `Puzzels${suffix}` } },
    description: { values: { en: "Imported puzzles (Slagzet).", nl: "Geïmporteerde puzzels (Slagzet)." } },
    status: "draft",
    sequenceIndex: nextSeq,
    tags: [PUZZELS_BOOK_TAG],
    lessonIds: [],
  });
  return created as unknown as Record<string, unknown>;
}

async function ensureCollectionLesson(
  owner: OwnerContext,
  bookId: string,
  collectionTitle: string
): Promise<{ lessonId: string; lessonRevision: number; isNew: boolean }> {
  const titleNorm = normalizeCollectionTitle(collectionTitle);
  const lessons = (await getLessonsByBookId(owner, bookId)) as unknown as Record<string, unknown>[];

  const matchingLessons = lessons
    .map((lesson) => {
      const values = (lesson.title as { values?: Record<string, string> })?.values;
      const label = normalizeText(values?.nl || values?.en || "");
      const part = parseCollectionPartNumber(label, titleNorm);
      if (part < 1) return null;
      return { lesson, part };
    })
    .filter((row): row is { lesson: Record<string, unknown>; part: number } => !!row)
    .sort((a, b) => a.part - b.part);

  for (const { lesson } of matchingLessons) {
    const lessonId = String(lesson.lessonId ?? lesson.id ?? "");
    const steps = await countLessonSteps(owner, lessonId);
    if (steps < MAX_STEPS_PER_LESSON) {
      return { lessonId, lessonRevision: Number(lesson.revision ?? 1), isNew: false };
    }
  }

  const nextPart = matchingLessons.length > 0 ? matchingLessons[matchingLessons.length - 1].part + 1 : 1;
  const lessonTitle = buildLessonTitle(titleNorm, nextPart);
  const lessonId = randomUUID();

  await createLesson(owner, {
    id: lessonId,
    lessonId,
    bookId,
    title: { values: { en: lessonTitle, nl: lessonTitle } },
    description: { values: { en: "", nl: "" } },
    variantId: "international",
    rulesetId: "classic",
    difficulty: 1,
    estimatedMinutes: 5,
    stepIds: [],
    branchesById: {},
  });

  return { lessonId, lessonRevision: 1, isNew: true };
}

const APPEND_RETRY_ATTEMPTS = 4;
const APPEND_RETRY_DELAY_MS = 120;

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function appendImportedPuzzleStep(
  owner: OwnerContext,
  job: Record<string, unknown>,
  authoringStep: Record<string, unknown>
): Promise<{
  skipped?: boolean;
  skipReason?: string;
  lessonId: string;
  stepId: string;
}> {
  const collectionName =
    (typeof job.collectionTitle === "string" && job.collectionTitle.trim()
      ? job.collectionTitle
      : null) ??
    (typeof job.collectionSlug === "string" ? job.collectionSlug : "Collectie");

  const selectedBook = await choosePuzzelsBook(owner);
  const bookId = String(selectedBook.bookId ?? selectedBook.id ?? "");

  const { lessonId, lessonRevision, isNew } = await ensureCollectionLesson(owner, bookId, collectionName);

  // If new lesson, register it on the book
  if (isNew) {
    const book = await getBookById(owner, bookId);
    if (!book) throw new NotFoundError("Puzzels book not found");
    for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await appendLessonIdToBook(owner, bookId, lessonId, Number(book.revision ?? 1));
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
        await waitMs(APPEND_RETRY_DELAY_MS * attempt);
      }
    }
  }

  const stepId = String(authoringStep.stepId ?? authoringStep.id ?? randomUUID());
  const lesson = await getLessonsByBookId(owner, bookId).then(
    (ls) => ls.find((l) => String((l as Record<string, unknown>).lessonId ?? (l as Record<string, unknown>).id) === lessonId) as Record<string, unknown> | undefined
  );

  if (!lesson) throw new NotFoundError("Collection lesson not found");

  const currentStepCount = Array.isArray(lesson.stepIds) ? lesson.stepIds.length : 0;

  // Persist the step document
  await createStep(owner, {
    ...authoringStep,
    id: stepId,
    stepId,
    lessonId,
    bookId,
    orderIndex: currentStepCount,
  });

  // Append stepId to lesson with retry on conflict
  for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
    try {
      await appendStepIdToLesson(owner, lessonId, stepId, lessonRevision + (attempt - 1));
      break;
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
      await waitMs(APPEND_RETRY_DELAY_MS * attempt);
    }
  }

  return { lessonId, stepId };
}
