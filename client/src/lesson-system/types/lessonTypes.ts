// client/src/lesson-system/types/lessonTypes.ts

import type { AuthoringLessonStep } from "./authoring/lessonStepTypes";
import type { LessonBranch } from "./authoring/branchTypes";
import type { LessonAuthoring } from "./authoring/curriculumTypes";
import type { LessonStep } from "./stepTypes";
import type { LocalizedText } from "./i18nTypes";

/** Timeline-first authoring payload stored on a `Lesson` (v2). */
export type LessonAuthoringBundle = {
  authoringLesson: LessonAuthoring;
  /** All steps keyed by id; `authoringLesson.stepIds` is the canonical order. */
  stepsById: Record<string, AuthoringLessonStep>;
  /** Optional side-lines keyed by id; referenced from `StepMoment.branchAction` (Bundel 7a). */
  branchesById?: Record<string, LessonBranch>;
};

export type Book = {
  id: string;
  bookId?: string;
  schemaVersion?: number;
  revision?: number;
  status?: string;
  tags?: string[];
  archivedAt?: string | null;
  title: LocalizedText;
  description?: LocalizedText;
  lessons: Lesson[];
  exams?: Exam[];
};

export type Lesson = {
  id: string;
  lessonId?: string;
  title: LocalizedText;
  description?: LocalizedText;

  variantId: string;
  rulesetId?: string;

  difficulty?: number;
  estimatedMinutes?: number;
  estimatedDurationMin?: number;

  steps: LessonStep[];

  /**
   * When present, the curriculum sidebar and timeline editor use this model.
   * Legacy `steps` remains for board / preview stubs until those views migrate.
   */
  authoringV2?: LessonAuthoringBundle;

  rewards?: RewardSpec[];
};

export type Exam = {
  id: string;
  title: LocalizedText;

  variantId: string;

  mode: "practice" | "official";
  passingScore: number;

  steps: LessonStep[];

  retryPolicy?: {
    maxAttempts?: number;
    cooldownHours?: number;
  };

  rewards?: RewardSpec[];
};

export type RewardSpec = {
  type: "badge" | "certificate" | "xp";
  value: string | number;
};