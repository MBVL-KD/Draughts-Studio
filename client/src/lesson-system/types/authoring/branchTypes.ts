import type { Id, LocalizedText, Side } from "./coreTypes";
import type { StepMoment } from "./timelineTypes";

/**
 * Branch data for lessons. Behaviour + editor flows come in a later bundle.
 * (Inline moment sequences on a branch can be added once the editor owns serialization.)
 */

export type BranchReturnPolicy =
  | { type: "returnToParentMoment"; momentId?: Id }
  | { type: "resumeNextMoment" }
  | { type: "resumeNextStep" }
  | { type: "jumpToStep"; stepId: Id };

export type BranchAction = {
  branchId: Id;
  mode: "inlineMomentSequence" | "stepSequence" | "showAndReturn";
  entryLabel?: LocalizedText;
  returnPolicy: BranchReturnPolicy;
};

/** Board context for branch preview / authoring (subset of step initial state). */
export type LessonBranchInitialState = {
  fen?: string;
  sideToMove?: Side;
  variantId?: string;
  rulesetId?: string;
};

/**
 * First-class branch payload on the lesson authoring bundle (`branchesById`).
 * `timeline` holds inline moments when extracted from a step (Bundel 7a).
 */
export type LessonBranch = {
  id: Id;
  lessonId: Id;
  title?: LocalizedText;
  description?: LocalizedText;
  stepIds?: Id[];
  branchRole?: "alternative" | "mistake" | "refutation" | "ruleExample" | "deepDive";
  timeline?: StepMoment[];
  initialState?: LessonBranchInitialState;
  /**
   * Bundel 7b: optional bundle-level hints for authors. `enterBranch.branchAction` is still the
   * per-link payload for future runtime; these fields document / mirror intent in the branch doc.
   */
  authoringMode?: "stepSequence" | "showAndReturn";
  authoringReturnPolicy?: BranchReturnPolicy;
};
