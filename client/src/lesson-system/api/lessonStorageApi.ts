import type { Book, Lesson } from "../types/lessonTypes";
import type { ApiError } from "./httpClient";
import { createBook, getBook, listBooks, patchBook } from "./booksApi";
import { apiPost } from "./httpClient";

export type PersistCurriculumBookParams = {
  book: Book;
  knownRevision: number | undefined;
  signal?: AbortSignal;
};

type ItemResponse<T> = { item: T };

/**
 * Saves a single lesson (and its v2 steps) to the separate collections.
 * Uses POST (upsert) semantics — no revision conflict check needed for authoring saves.
 */
async function saveLesson(lesson: Lesson, bookId: string, signal?: AbortSignal): Promise<void> {
  const lessonId = lesson.lessonId ?? lesson.id;

  const authoringBundle = lesson.authoringV2;
  const stepIds = authoringBundle
    ? [...(authoringBundle.authoringLesson.stepIds ?? [])]
    : (lesson.steps ?? []).map((s) => s.stepId ?? s.id ?? "").filter(Boolean);

  const lessonDocument = {
    id: lessonId,
    lessonId,
    bookId,
    title: lesson.title,
    description: lesson.description,
    isExam: lesson.isExam,
    examConfig: lesson.examConfig,
    variantId: lesson.variantId,
    rulesetId: lesson.rulesetId,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes ?? lesson.estimatedDurationMin,
    rewards: lesson.rewards,
    stepIds,
    entryStepId: stepIds[0] ?? null,
    ...(authoringBundle?.branchesById ? { branchesById: authoringBundle.branchesById } : {}),
  };

  await apiPost<ItemResponse<Lesson>>("/api/lessons", { document: lessonDocument }, { signal });

  // Save each v2 step from the authoring bundle
  if (authoringBundle) {
    const { stepsById, authoringLesson } = authoringBundle;
    const orderedIds = authoringLesson.stepIds ?? [];
    await Promise.all(
      orderedIds.map(async (stepId, orderIndex) => {
        const step = stepsById[stepId];
        if (!step) return;
        const stepDocument = {
          ...step,
          id: stepId,
          stepId,
          lessonId,
          bookId,
          orderIndex,
        };
        await apiPost<ItemResponse<unknown>>("/api/steps", { document: stepDocument }, { signal });
      })
    );
  }
}

/**
 * Persists the full curriculum book: saves book metadata, then each lesson and its steps
 * as separate documents in their respective collections.
 */
export async function persistCurriculumBookDocument(
  params: PersistCurriculumBookParams
): Promise<ItemResponse<Book>> {
  const { book, knownRevision, signal } = params;
  const bookId = (book.bookId ?? book.id) as string;

  // ── 1. Save book metadata ────────────────────────────────────────────────────
  const bookMetadata: Book = {
    ...book,
    // Strip embedded lessons — server stores only lessonIds[]
    lessons: [],
  };

  let bookResponse: ItemResponse<Book>;
  if (typeof knownRevision === "number" && Number.isFinite(knownRevision)) {
    bookResponse = await patchBook(bookId, knownRevision, bookMetadata, { signal });
  } else {
    bookResponse = await createBook(bookMetadata, { signal });
  }

  // ── 2. Save each lesson and its steps in parallel ────────────────────────────
  await Promise.all(
    (book.lessons ?? []).map((lesson) => saveLesson(lesson, bookId, signal))
  );

  return bookResponse;
}

export function formatStorageApiError(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  if (!apiError || typeof apiError !== "object") return fallback;
  const base = apiError.message || fallback;
  const issues = Array.isArray(apiError.issues) ? apiError.issues : [];
  if (issues.length === 0) return base;
  const top = issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(" | ");
  return `${base} — ${top}`;
}

export { getBook, listBooks };
