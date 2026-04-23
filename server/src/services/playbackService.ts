import { buildAuthoringTimelinePlaybackBlock } from "../playback/buildAuthoringTimelineForPlayback";
import { buildRuntimeValidationFromV2Step } from "../playback/buildRuntimeValidation";
import { buildPlaybackHintFromV2Step } from "../playback/buildPlaybackHint";

type LocalizedTextLike = { values?: Record<string, string> };

export type PlaybackNavigationMeta = {
  bookId: string;
  lessonId: string;
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  previousStepId: string | null;
  nextStepId: string | null;
};

function readLocalizedText(value: LocalizedTextLike | undefined | null, language: string): string {
  if (!value?.values) return "";
  return value.values[language] ?? value.values.en ?? "";
}

/**
 * Builds a runtime playback payload from a v2 AuthoringLessonStep.
 * No legacy v1 step involved — timeline is the single source of truth.
 */
export function buildPlaybackPayload(params: {
  step: Record<string, unknown>;
  orderedStepIds: string[];
  language?: string;
  variantId?: string;
  lessonId: string;
  bookId: string;
}) {
  const { step, orderedStepIds, lessonId, bookId } = params;
  const language = params.language ?? "en";

  const stepId = String(step.stepId ?? step.id ?? "");
  const initialState = step.initialState as Record<string, unknown> | undefined;
  const initialFen = String(initialState?.fen ?? "").trim();
  const sideToMove = initialState?.sideToMove === "black" ? "black" : "white";
  const variantId = String(
    (initialState?.variantId as string | undefined) ?? params.variantId ?? "international"
  );

  const idx = orderedStepIds.findIndex((id) => id === stepId);
  const navigation: PlaybackNavigationMeta = {
    bookId,
    lessonId,
    stepId,
    stepIndex: idx >= 0 ? idx : 0,
    totalSteps: orderedStepIds.length,
    previousStepId: idx > 0 ? (orderedStepIds[idx - 1] ?? null) : null,
    nextStepId:
      idx >= 0 && idx < orderedStepIds.length - 1 ? (orderedStepIds[idx + 1] ?? null) : null,
  };

  const { validation, puzzleScan } = buildRuntimeValidationFromV2Step(step, language);
  const authoringPlayback = buildAuthoringTimelinePlaybackBlock(step, language);
  const hint = buildPlaybackHintFromV2Step(step, language);

  return {
    payloadType: "lesson-step-playback" as const,
    payloadVersion: 2 as const,
    stepId,
    lessonId,
    stepKind: String(step.kind ?? ""),
    title: readLocalizedText(step.title as LocalizedTextLike | undefined, language),
    initialFen,
    sideToMove,
    variantId,
    validation,
    puzzleScan,
    navigation,
    stepIndex: navigation.stepIndex,
    totalSteps: navigation.totalSteps,
    previousStepId: navigation.previousStepId,
    nextStepId: navigation.nextStepId,
    ...(authoringPlayback ?? {}),
    ...(hint ? { hint } : {}),
  };
}
