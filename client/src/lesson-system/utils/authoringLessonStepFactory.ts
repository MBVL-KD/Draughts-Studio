import type { Lesson, LessonAuthoringBundle } from "../types/lessonTypes";
import type { LessonAuthoring } from "../types/authoring/curriculumTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import { createLocalizedText } from "./i18nHelpers";
import { createMoment } from "./timelineMomentFactories";

export function createDefaultAuthoringLessonStep(lessonId: string): AuthoringLessonStep {
  const id = crypto.randomUUID();
  return {
    id,
    lessonId,
    kind: "explain",
    orderIndex: 0,
    title: createLocalizedText("New step", ""),
    initialState: {
      fen: "",
      sideToMove: "white",
      variantId: "international",
    },
    timeline: [createMoment("introText")],
  };
}

export function createEmptyAuthoringBundle(bookId: string, lesson: Lesson): LessonAuthoringBundle {
  const lessonId = lesson.lessonId ?? lesson.id;
  const step = createDefaultAuthoringLessonStep(lessonId);
  const authoringLesson: LessonAuthoring = {
    id: lessonId,
    bookId,
    slug: `lesson-${lessonId}`,
    title: lesson.title,
    description: lesson.description,
    entryStepId: step.id,
    stepIds: [step.id],
  };
  return {
    authoringLesson,
    stepsById: { [step.id]: { ...step, orderIndex: 0 } },
    branchesById: {},
  };
}
