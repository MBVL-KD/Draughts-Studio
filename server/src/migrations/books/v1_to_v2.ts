import { randomUUID } from "crypto";

type StepLike = {
  id?: string;
  stepId?: string;
  [key: string]: unknown;
};

type LessonLike = {
  id?: string;
  lessonId?: string;
  steps?: StepLike[];
  [key: string]: unknown;
};

type BookLike = {
  id?: string;
  bookId?: string;
  schemaVersion?: number;
  lessons?: LessonLike[];
  [key: string]: unknown;
};

function resolveSyncedId(canonical?: string, legacy?: string): string {
  if (canonical && canonical.trim()) return canonical;
  if (legacy && legacy.trim()) return legacy;
  return randomUUID();
}

function syncIdPair<T extends Record<string, unknown>>(
  input: T,
  canonicalKey: string,
  legacyKey = "id"
): T {
  const canonical = typeof input[canonicalKey] === "string" ? (input[canonicalKey] as string) : undefined;
  const legacy = typeof input[legacyKey] === "string" ? (input[legacyKey] as string) : undefined;
  const value = resolveSyncedId(canonical, legacy);
  return {
    ...input,
    [canonicalKey]: value,
    [legacyKey]: value,
  };
}

export function migrateBookV1ToV2(input: BookLike): BookLike {
  const rootSynced = syncIdPair(input, "bookId");
  const lessons = (rootSynced.lessons ?? []).map((lesson) => {
    const syncedLesson = syncIdPair(lesson, "lessonId");
    const steps = (syncedLesson.steps ?? []).map((step) => syncIdPair(step, "stepId"));
    return {
      ...syncedLesson,
      steps,
    };
  });

  return {
    ...rootSynced,
    lessons,
    schemaVersion: 2,
    revision: input.revision,
  };
}

