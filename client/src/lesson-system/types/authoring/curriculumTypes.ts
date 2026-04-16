import type { Id, LocalizedText, TimestampString } from "./coreTypes";

/**
 * Book / module / lesson containers (v2 authoring).
 * Intentionally no unlock/completion/reward complexity yet.
 */

export type LessonBook = {
  id: Id;
  slug: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  description?: LocalizedText;
  moduleIds: Id[];
  metadata?: {
    version?: number;
    createdAt?: TimestampString;
    updatedAt?: TimestampString;
  };
};

export type LessonModule = {
  id: Id;
  bookId: Id;
  title: LocalizedText;
  description?: LocalizedText;
  orderIndex: number;
  lessonIds: Id[];
};

/**
 * One teachable unit. Steps are ordered by `stepIds`; graph flow comes later.
 */
export type LessonAuthoring = {
  id: Id;
  bookId: Id;
  moduleId?: Id;
  slug: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  description?: LocalizedText;
  entryStepId: Id;
  stepIds: Id[];
  metadata?: {
    version?: number;
    createdAt?: TimestampString;
    updatedAt?: TimestampString;
  };
};
