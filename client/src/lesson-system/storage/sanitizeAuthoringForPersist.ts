import type { LessonBranch } from "../types/authoring/branchTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LessonAuthoringBundle } from "../types/lessonTypes";

function stripMomentEditorFields(moment: StepMoment): StepMoment {
  const { editorMeta: _e, ...rest } = moment;
  return rest;
}

function stripStepEditorFields(step: AuthoringLessonStep): AuthoringLessonStep {
  const { editorMeta: _e, ...rest } = step;
  return {
    ...rest,
    timeline: (step.timeline ?? []).map(stripMomentEditorFields),
  };
}

function stripBranchEditorFields(branch: LessonBranch): LessonBranch {
  return {
    ...branch,
    timeline: (branch.timeline ?? []).map(stripMomentEditorFields),
  };
}

/** Removes editor-only UI metadata before persistence (moments, steps, branches). */
export function sanitizeAuthoringBundleForPersist(bundle: LessonAuthoringBundle): LessonAuthoringBundle {
  const stepsById: Record<string, AuthoringLessonStep> = {};
  for (const id of Object.keys(bundle.stepsById)) {
    const step = bundle.stepsById[id];
    if (step) stepsById[id] = stripStepEditorFields(step);
  }
  const branchesById = bundle.branchesById;
  let nextBranches: Record<string, LessonBranch> | undefined;
  if (branchesById) {
    nextBranches = {};
    for (const bid of Object.keys(branchesById)) {
      const b = branchesById[bid];
      if (b) nextBranches[bid] = stripBranchEditorFields(b);
    }
  }
  return {
    ...bundle,
    stepsById,
    branchesById: nextBranches,
  };
}
