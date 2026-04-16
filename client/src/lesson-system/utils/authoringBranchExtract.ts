import type {
  AuthoringLessonStep,
  AuthoringStepInitialState,
} from "../types/authoring/lessonStepTypes";
import type {
  BranchAction,
  LessonBranch,
  LessonBranchInitialState,
} from "../types/authoring/branchTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LocalizedText } from "../types/i18nTypes";
import { createLocalizedText } from "./i18nHelpers";

export type AuthoringBranchExtractOptions = {
  branchId?: string;
  title?: LocalizedText;
};

export type ExtractMomentsToLessonBranchResult = {
  updatedOriginal: AuthoringLessonStep;
  branch: LessonBranch;
  linkMomentId: string;
};

export function deriveBranchInitialState(
  base: AuthoringStepInitialState,
  firstMomentInBranch: StepMoment | undefined
): LessonBranchInitialState {
  const copy: LessonBranchInitialState = {
    fen: base.fen,
    sideToMove: base.sideToMove,
    variantId: base.variantId,
    rulesetId: base.rulesetId,
  };
  const ref = firstMomentInBranch?.positionRef;
  if (ref?.type === "fen" && ref.fen?.trim()) {
    copy.fen = ref.fen.trim();
  }
  return copy;
}

/**
 * Link moment on the main step timeline after “extract to branch”.
 * Runtime branch playback is not implemented yet (Bundel 7a = authoring only).
 */
export function createEnterBranchLinkMoment(
  branchId: string,
  partial?: Partial<BranchAction>
): StepMoment {
  const branchAction: BranchAction = {
    branchId,
    mode: partial?.mode ?? "stepSequence",
    entryLabel: partial?.entryLabel,
    returnPolicy: partial?.returnPolicy ?? { type: "resumeNextMoment" },
  };
  return {
    id: crypto.randomUUID(),
    type: "enterBranch",
    title: createLocalizedText("Side line", "Zijlijn"),
    body: createLocalizedText(
      "Linked branch (authoring only; no branch playback yet).",
      "Gekoppelde zijlijn (alleen authoring; nog geen afspeel-runtime)."
    ),
    branchAction,
  };
}

/**
 * Move a **contiguous** block of moments into `branchesById` and replace that range on the step
 * with a single `enterBranch` link moment. Returns `null` if ids are invalid, non-contiguous,
 * or would leave the step without moments besides the link (original must keep ≥1 moment total).
 */
export function extractMomentsToLessonBranch(
  step: AuthoringLessonStep,
  selectedMomentIds: string[],
  options?: AuthoringBranchExtractOptions
): ExtractMomentsToLessonBranchResult | null {
  const uniq = [...new Set(selectedMomentIds)];
  if (uniq.length === 0) return null;

  const indices = uniq.map((id) => step.timeline.findIndex((m) => m.id === id));
  if (indices.some((i) => i < 0)) return null;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let k = 1; k < sorted.length; k += 1) {
    if (sorted[k] !== sorted[k - 1]! + 1) return null;
  }

  const selected = new Set(uniq);
  const extracted = step.timeline.filter((m) => selected.has(m.id));
  const remaining = step.timeline.filter((m) => !selected.has(m.id));
  if (extracted.length === 0 || remaining.length === 0) return null;

  const branchId = options?.branchId ?? crypto.randomUUID();
  const link = createEnterBranchLinkMoment(branchId);
  const i0 = sorted[0]!;
  const i1 = sorted[sorted.length - 1]!;
  const head = step.timeline.slice(0, i0);
  const tail = step.timeline.slice(i1 + 1);
  const newTimeline = [...head, link, ...tail];

  const first = extracted[0];
  const branch: LessonBranch = {
    id: branchId,
    lessonId: step.lessonId,
    title:
      options?.title ??
      createLocalizedText("Side line", "Zijlijn"),
    timeline: extracted,
    initialState: deriveBranchInitialState(step.initialState, first),
    authoringMode: "stepSequence",
    authoringReturnPolicy: { type: "resumeNextMoment" },
  };

  return {
    updatedOriginal: { ...step, timeline: newTimeline },
    branch,
    linkMomentId: link.id,
  };
}
