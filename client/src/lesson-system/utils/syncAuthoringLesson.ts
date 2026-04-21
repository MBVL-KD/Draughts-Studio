import type { Lesson } from "../types/lessonTypes";
import type { LessonStep } from "../types/stepTypes";
import { authoringLessonStepToLegacyStub } from "./authoringStepToLegacyStub";

/** Keeps `lesson.steps` aligned with `authoringV2` order (board / preview stubs). */
export function syncLessonLegacyStepsFromAuthoring(lesson: Lesson): Lesson {
  if (!lesson.authoringV2) return lesson;
  const b = lesson.authoringV2;
  /** Board overlay tools write here; stubs do not rebuild highlights/arrows/routes from authoring. */
  const prevById = new Map(lesson.steps.map((s) => [s.id, s]));
  const steps: LessonStep[] = b.authoringLesson.stepIds
    .map((id) => b.stepsById[id])
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((a) => {
      const stub = authoringLessonStepToLegacyStub(a);
      const prev = prevById.get(stub.id);
      const ph = prev?.presentation?.highlights;
      const pa = prev?.presentation?.arrows;
      const pr = prev?.presentation?.routes;
      const hasBoardOverlay =
        (ph?.length ?? 0) > 0 || (pa?.length ?? 0) > 0 || (pr?.length ?? 0) > 0;
      if (!hasBoardOverlay) return stub;
      return {
        ...stub,
        presentation: {
          ...stub.presentation,
          highlights: [...(ph ?? [])],
          arrows: [...(pa ?? [])],
          routes: [...(pr ?? [])],
        },
      };
    });
  return { ...lesson, steps };
}
