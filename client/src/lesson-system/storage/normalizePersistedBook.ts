import type { Book } from "../types/lessonTypes";
import { syncLessonLegacyStepsFromAuthoring } from "../utils/syncAuthoringLesson";
import { BOOK_DOCUMENT_SCHEMA_VERSION } from "./authoringStorageConstants";
import { normalizeAuthoringBundleForPersist } from "./normalizeAuthoringForSave";
import { sanitizeAuthoringBundleForPersist } from "./sanitizeAuthoringForPersist";

/**
 * Full book normalization for PATCH/POST: canonical ids, schemaVersion default,
 * authoring-v2 normalize → sanitize (editor-only fields stripped for storage).
 */
export function normalizeBookForSave(book: Book): Book {
  const bookId = book.bookId ?? book.id;
  return {
    ...book,
    id: bookId,
    bookId,
    schemaVersion:
      typeof book.schemaVersion === "number" ? book.schemaVersion : BOOK_DOCUMENT_SCHEMA_VERSION,
    revision: typeof book.revision === "number" ? book.revision : 1,
    status: book.status ?? "draft",
    lessons: (book.lessons ?? []).map((lesson) => {
      const lessonId = lesson.lessonId ?? lesson.id;
      return {
        ...lesson,
        id: lessonId,
        lessonId,
        steps: (lesson.steps ?? []).map((step) => {
          const stepId = step.stepId ?? step.id;
          return {
            ...step,
            id: stepId,
            stepId,
          };
        }),
        authoringV2: lesson.authoringV2
          ? sanitizeAuthoringBundleForPersist(
              normalizeAuthoringBundleForPersist(lesson.authoringV2, lessonId, bookId)
            )
          : undefined,
      };
    }),
  };
}

export function normalizeBookFromServer(book: Book): Book {
  const normalized = normalizeBookForSave(book);
  return {
    ...normalized,
    lessons: normalized.lessons.map((lesson) => {
      const withVariant = {
        ...lesson,
        variantId: lesson.variantId ?? "international",
      };
      return withVariant.authoringV2
        ? syncLessonLegacyStepsFromAuthoring(withVariant)
        : withVariant;
    }),
  };
}
