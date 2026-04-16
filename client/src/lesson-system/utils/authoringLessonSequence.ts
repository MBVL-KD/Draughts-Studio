import type { LessonAuthoring } from "../types/authoring/curriculumTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { LessonAuthoringBundle } from "../types/lessonTypes";

function cloneStepWithNewIds(step: AuthoringLessonStep, lessonId: string): AuthoringLessonStep {
  const newStepId = crypto.randomUUID();
  return {
    ...step,
    id: newStepId,
    lessonId,
    timeline: step.timeline.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
    })),
  };
}

function syncLinearEntry(authoringLesson: LessonAuthoring, stepIds: string[]): LessonAuthoring {
  return {
    ...authoringLesson,
    stepIds,
    entryStepId: stepIds[0] ?? authoringLesson.entryStepId,
  };
}

export function reindexStepsOrder(
  bundle: LessonAuthoringBundle,
  lessonId: string
): LessonAuthoringBundle {
  const stepsById = { ...bundle.stepsById };
  bundle.authoringLesson.stepIds.forEach((id, orderIndex) => {
    const s = stepsById[id];
    if (s) stepsById[id] = { ...s, orderIndex, lessonId };
  });
  return { ...bundle, stepsById };
}

export function insertStepBefore(
  bundle: LessonAuthoringBundle,
  anchorStepId: string | null,
  newStep: AuthoringLessonStep,
  lessonId: string
): LessonAuthoringBundle {
  const ids = [...bundle.authoringLesson.stepIds];
  const step = { ...newStep, lessonId };
  if (anchorStepId == null) {
    ids.unshift(step.id);
  } else {
    const i = ids.indexOf(anchorStepId);
    if (i < 0) ids.unshift(step.id);
    else ids.splice(i, 0, step.id);
  }
  const next: LessonAuthoringBundle = {
    authoringLesson: syncLinearEntry(bundle.authoringLesson, ids),
    stepsById: { ...bundle.stepsById, [step.id]: step },
    branchesById: bundle.branchesById,
  };
  return reindexStepsOrder(next, lessonId);
}

export function insertStepAfter(
  bundle: LessonAuthoringBundle,
  anchorStepId: string | null,
  newStep: AuthoringLessonStep,
  lessonId: string
): LessonAuthoringBundle {
  const ids = [...bundle.authoringLesson.stepIds];
  const step = { ...newStep, lessonId };
  if (anchorStepId == null) {
    ids.push(step.id);
  } else {
    const i = ids.indexOf(anchorStepId);
    if (i < 0) ids.push(step.id);
    else ids.splice(i + 1, 0, step.id);
  }
  const next: LessonAuthoringBundle = {
    authoringLesson: syncLinearEntry(bundle.authoringLesson, ids),
    stepsById: { ...bundle.stepsById, [step.id]: step },
    branchesById: bundle.branchesById,
  };
  return reindexStepsOrder(next, lessonId);
}

export function duplicateStep(
  bundle: LessonAuthoringBundle,
  stepId: string,
  lessonId: string
): LessonAuthoringBundle | null {
  const original = bundle.stepsById[stepId];
  if (!original) return null;
  const copy = cloneStepWithNewIds(original, lessonId);
  return insertStepAfter(bundle, stepId, copy, lessonId);
}

export function deleteStep(
  bundle: LessonAuthoringBundle,
  stepId: string,
  lessonId: string
): LessonAuthoringBundle | null {
  const ids = bundle.authoringLesson.stepIds.filter((id) => id !== stepId);
  if (ids.length === bundle.authoringLesson.stepIds.length) return null;
  if (ids.length === 0) return null;
  const { [stepId]: _removed, ...rest } = bundle.stepsById;
  const next: LessonAuthoringBundle = {
    authoringLesson: syncLinearEntry(bundle.authoringLesson, ids),
    stepsById: rest,
    branchesById: bundle.branchesById,
  };
  return reindexStepsOrder(next, lessonId);
}

export function moveStepUp(
  bundle: LessonAuthoringBundle,
  stepId: string,
  lessonId: string
): LessonAuthoringBundle | null {
  const ids = [...bundle.authoringLesson.stepIds];
  const i = ids.indexOf(stepId);
  if (i <= 0) return null;
  [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
  const next: LessonAuthoringBundle = {
    authoringLesson: syncLinearEntry(bundle.authoringLesson, ids),
    stepsById: { ...bundle.stepsById },
    branchesById: bundle.branchesById,
  };
  return reindexStepsOrder(next, lessonId);
}

export function moveStepDown(
  bundle: LessonAuthoringBundle,
  stepId: string,
  lessonId: string
): LessonAuthoringBundle | null {
  const ids = [...bundle.authoringLesson.stepIds];
  const i = ids.indexOf(stepId);
  if (i < 0 || i >= ids.length - 1) return null;
  [ids[i], ids[i + 1]] = [ids[i + 1]!, ids[i]!];
  const next: LessonAuthoringBundle = {
    authoringLesson: syncLinearEntry(bundle.authoringLesson, ids),
    stepsById: { ...bundle.stepsById },
    branchesById: bundle.branchesById,
  };
  return reindexStepsOrder(next, lessonId);
}

/** Drop unknown step ids, align `entryStepId`, fix nested ids before save. */
export function normalizeAuthoringBundleForLesson(
  bundle: LessonAuthoringBundle,
  lessonId: string,
  bookId: string
): LessonAuthoringBundle {
  const stepIds = bundle.authoringLesson.stepIds.filter((id) => bundle.stepsById[id]);
  const stepsById: Record<string, AuthoringLessonStep> = {};
  for (const id of stepIds) {
    const s = bundle.stepsById[id]!;
    const sid = s.id ?? id;
    stepsById[sid] = { ...s, id: sid, lessonId };
  }
  return reindexStepsOrder(
    {
      authoringLesson: {
        ...bundle.authoringLesson,
        id: lessonId,
        bookId,
        stepIds,
        entryStepId: stepIds[0] ?? bundle.authoringLesson.entryStepId,
      },
      stepsById,
      branchesById: bundle.branchesById,
    },
    lessonId
  );
}
