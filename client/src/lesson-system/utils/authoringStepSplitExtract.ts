import type {
  AuthoringLessonStep,
  AuthoringStepInitialState,
} from "../types/authoring/lessonStepTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LocalizedText } from "../types/i18nTypes";
import { createLocalizedText } from "./i18nHelpers";

export type AuthoringStepSplitExtractOptions = {
  newStepId?: string;
  /** Defaults to source step kind. */
  kind?: AuthoringLessonStep["kind"];
  /** Overrides auto title for the new step. */
  title?: LocalizedText;
};

export type AuthoringStepSplitResult = {
  updatedOriginal: AuthoringLessonStep;
  newStep: AuthoringLessonStep;
};

function deriveInitialStateForNewStep(
  base: AuthoringStepInitialState,
  firstMomentInNewStep: StepMoment | undefined
): AuthoringStepInitialState {
  const copy: AuthoringStepInitialState = { ...base };
  const ref = firstMomentInNewStep?.positionRef;
  if (ref?.type === "fen" && ref.fen?.trim()) {
    copy.fen = ref.fen.trim();
  }
  return copy;
}

export function buildNewStepFromTimelineTail(
  source: AuthoringLessonStep,
  tailTimeline: StepMoment[],
  options?: AuthoringStepSplitExtractOptions
): AuthoringLessonStep {
  const id = options?.newStepId ?? crypto.randomUUID();
  const first = tailTimeline[0];
  return {
    id,
    lessonId: source.lessonId,
    kind: options?.kind ?? source.kind,
    orderIndex: source.orderIndex,
    title:
      options?.title ??
      createLocalizedText("New part", "Nieuw deel"),
    shortTitle: source.shortTitle,
    goal: source.goal,
    summary: source.summary,
    initialState: deriveInitialStateForNewStep(source.initialState, first),
    scene: source.scene ? { ...source.scene } : undefined,
    sourceRef: source.sourceRef ? { ...source.sourceRef } : undefined,
    tags: source.tags ? [...source.tags] : undefined,
    editorMeta: source.editorMeta ? { ...source.editorMeta } : undefined,
    metadata: source.metadata ? { ...source.metadata } : undefined,
    timeline: tailTimeline,
  };
}

/**
 * Split so the original step keeps moments **before** `momentId`, and a new step receives
 * `momentId` and all following moments. New step id defaults to `crypto.randomUUID()`.
 *
 * `initialState` of the new step is a copy of the source unless the first moment in the tail
 * has `positionRef.type === "fen"`, in which case that FEN becomes `initialState.fen`.
 */
export function splitStepAtMoment(
  step: AuthoringLessonStep,
  momentId: string,
  options?: AuthoringStepSplitExtractOptions
): AuthoringStepSplitResult | null {
  const idx = step.timeline.findIndex((m) => m.id === momentId);
  if (idx < 0 || idx >= step.timeline.length) return null;

  const before = step.timeline.slice(0, idx);
  const tail = step.timeline.slice(idx);
  const newStep = buildNewStepFromTimelineTail(step, tail, options);
  return {
    updatedOriginal: { ...step, timeline: before },
    newStep,
  };
}

/**
 * Move a **contiguous** block of moments (by id) into a new step. Remaining moments stay on the
 * original in timeline order. Returns `null` if ids are missing, non-contiguous, or would leave
 * the original without any moments.
 */
export function extractMomentsToNewStep(
  step: AuthoringLessonStep,
  selectedMomentIds: string[],
  options?: AuthoringStepSplitExtractOptions
): AuthoringStepSplitResult | null {
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

  const newStep = buildNewStepFromTimelineTail(step, extracted, options);
  return {
    updatedOriginal: { ...step, timeline: remaining },
    newStep,
  };
}
