import type { Book, Lesson, LessonAuthoringBundle } from "../types/lessonTypes";
import type { ApiError } from "./httpClient";
import { createBook, getBook, listBooks, patchBook } from "./booksApi";
import { getLessonsByBook } from "./lessonsApi";
import { getStepsByLesson } from "./stepsApi";
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
    : lesson.stepIds?.length
      ? [...lesson.stepIds]
      : (lesson.steps ?? []).map((s) => s.stepId ?? s.id ?? "").filter(Boolean);

  // Don't save a lesson that has never been loaded (no authoringV2, no steps, no stepIds)
  // — doing so would overwrite the server's stepIds with an empty array.
  if (!authoringBundle && stepIds.length === 0 && (lesson.steps ?? []).length === 0) return;

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

/**
 * Fetches all steps for a lesson and assembles an authoringV2 bundle.
 * Call this when a lesson is first opened for editing.
 */
export async function loadStepsForLesson(
  lesson: Lesson,
  bookId: string,
  signal?: AbortSignal
): Promise<LessonAuthoringBundle> {
  const lessonId = lesson.lessonId ?? lesson.id;
  const stepsResponse = await getStepsByLesson(lessonId, { signal });
  const steps = stepsResponse?.items ?? [];
  const stepsById = Object.fromEntries(
    steps.map((s) => {
      const id = (s as { stepId?: string; id?: string }).stepId ?? (s as { id?: string }).id ?? "";
      return [id, s];
    })
  );
  const stepIds =
    (lesson as unknown as { stepIds?: string[] }).stepIds ??
    steps.map((s) => (s as { stepId?: string; id?: string }).stepId ?? (s as { id?: string }).id ?? "").filter(Boolean);
  const entryStepId =
    (lesson as unknown as { entryStepId?: string }).entryStepId ?? stepIds[0] ?? "";

  return {
    authoringLesson: {
      id: lessonId,
      bookId,
      slug: lessonId,
      title: lesson.title,
      entryStepId,
      stepIds,
    },
    stepsById,
    branchesById: (lesson as unknown as { branchesById?: LessonAuthoringBundle["branchesById"] }).branchesById,
  };
}

/**
 * Hydrates a book with lesson metadata from the server (without steps).
 * Used during initial load so the sidebar can show lesson names.
 * Steps are loaded lazily via `loadStepsForLesson` when a lesson is opened.
 */
export async function hydrateBookWithLessons(book: Book, signal?: AbortSignal): Promise<Book> {
  const bookId = (book.bookId ?? book.id) as string;
  if (!bookId) return book;
  try {
    const response = await getLessonsByBook(bookId, { signal });
    const lessons: Lesson[] = (response?.items ?? []).map((l) => {
      const raw = l as unknown as Record<string, unknown>;
      const lessonId = String(raw.lessonId ?? raw.id ?? "");
      return {
        ...(l as Lesson),
        id: lessonId,
        lessonId,
        steps: [],
        authoringV2: undefined,
      };
    });
    return { ...book, lessons };
  } catch {
    return book;
  }
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
