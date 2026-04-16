import type { LessonAuthoringBundle } from "../types/lessonTypes";
import { normalizeAuthoringBundleForLesson } from "../utils/authoringLessonSequence";
import { normalizeAuthoringBundleForPersist } from "./normalizeAuthoringForSave";
import { sanitizeAuthoringBundleForPersist } from "./sanitizeAuthoringForPersist";

/** Persist-ready bundle (normalize + sanitize). */
export function serializeAuthoringLessonBundle(
  bundle: LessonAuthoringBundle,
  lessonId: string,
  bookId: string
): LessonAuthoringBundle {
  return sanitizeAuthoringBundleForPersist(
    normalizeAuthoringBundleForPersist(bundle, lessonId, bookId)
  );
}

/** Load path: align ids/order; keeps editor metadata from disk when present. */
export function deserializeAuthoringLessonBundle(
  bundle: LessonAuthoringBundle,
  lessonId: string,
  bookId: string
): LessonAuthoringBundle {
  return normalizeAuthoringBundleForLesson(bundle, lessonId, bookId);
}
