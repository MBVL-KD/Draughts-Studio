import type { Lesson } from "../types/lessonTypes";
import type { LessonStep } from "../types/stepTypes";
import { authoringLessonStepToLegacyStub } from "./authoringStepToLegacyStub";

/** Keeps `lesson.steps` aligned with `authoringV2` order (board / preview stubs). */
export function syncLessonLegacyStepsFromAuthoring(lesson: Lesson): Lesson {
  if (!lesson.authoringV2) return lesson;
  const b = lesson.authoringV2;
  const steps: LessonStep[] = b.authoringLesson.stepIds
    .map((id) => b.stepsById[id])
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((a) => authoringLessonStepToLegacyStub(a));
  return { ...lesson, steps };
}
