import { fenToBoardState } from "../../features/board/fenUtils";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";
import { readLocalizedText } from "./i18nHelpers";
import type { Lesson } from "../types/lessonTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { AskSequenceInteraction } from "../types/authoring/interactionTypes";

type RuntimeMove = {
  notation: string;
  from: number;
  to: number;
  path: number[];
  captures: number[];
  resultFen: string;
};

function moveToNotation(mv: { from?: number; to?: number; path?: number[]; captures?: number[] }): string {
  const from = Number(mv.from);
  const to = Number(mv.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
  const path = Array.isArray(mv.path) && mv.path.length >= 2 ? mv.path : [from, to];
  const isCapture = (Array.isArray(mv.captures) && mv.captures.length > 0) || path.length > 2;
  return path.join(isCapture ? "x" : "-");
}

function buildAcceptedLineFromAskSequence(
  initialFen: string,
  expectedSequence: Array<{ from?: number; to?: number; path?: number[]; captures?: number[] }>
): RuntimeMove[] {
  if (!initialFen.trim()) return [];
  let board;
  try {
    board = fenToBoardState(initialFen);
  } catch {
    return [];
  }
  const out: RuntimeMove[] = [];
  for (const spec of expectedSequence) {
    const notation = moveToNotation(spec);
    if (!notation) return [];
    const em = resolveNotationToEngineMove(board, notation);
    if (!em?.fenAfter) return [];
    out.push({
      notation: em.notation || notation,
      from: em.from,
      to: em.to,
      path: em.path,
      captures: em.captures,
      resultFen: em.fenAfter,
    });
    try {
      board = fenToBoardState(em.fenAfter);
    } catch {
      return [];
    }
  }
  return out;
}

export function buildLocalAuthoringPlaybackFallback(params: {
  lesson: Lesson;
  stepId: string;
  bookId?: string;
  language: LanguageCode;
}) {
  const { lesson, stepId, bookId, language } = params;
  const stepIds = lesson.authoringV2?.authoringLesson.stepIds ?? lesson.steps.map((s) => s.id);
  const stepIndex = stepIds.findIndex((id) => id === stepId);
  const totalSteps = stepIds.length;
  const previousStepId = stepIndex > 0 ? stepIds[stepIndex - 1] ?? null : null;
  const nextStepId = stepIndex >= 0 && stepIndex < stepIds.length - 1 ? stepIds[stepIndex + 1] ?? null : null;

  const legacyStep = lesson.steps.find((s) => s.id === stepId);
  const authoringStep = lesson.authoringV2?.stepsById?.[stepId];
  const initialFen = legacyStep?.initialState?.fen ?? "";
  const prompt = readLocalizedText(legacyStep?.prompt, language);
  const title = readLocalizedText(legacyStep?.title, language);
  const timeline = authoringStep?.timeline ?? [];
  const askSequenceMoment = timeline.find(
    (m) =>
      m?.type === "askSequence" &&
      m?.interaction?.kind === "askSequence" &&
      Array.isArray(m.interaction.expectedSequence) &&
      m.interaction.expectedSequence.length > 0
  );
  const askSequenceInteraction =
    askSequenceMoment?.type === "askSequence" && askSequenceMoment.interaction?.kind === "askSequence"
      ? (askSequenceMoment.interaction as AskSequenceInteraction)
      : null;
  const acceptedMoves = askSequenceMoment
    ? buildAcceptedLineFromAskSequence(initialFen, askSequenceInteraction?.expectedSequence ?? [])
    : [];

  return {
    payloadType: "lesson-step-playback",
    payloadVersion: 2,
    lessonId: lesson.lessonId ?? lesson.id,
    stepId,
    variantId: lesson.variantId,
    initialFen,
    title,
    prompt,
    validation: acceptedMoves.length
      ? {
          runtimeKind: "line",
          acceptMode: "exact",
          moveSource: "timeline_engine",
          acceptedLines: [{ moves: acceptedMoves }],
        }
      : { runtimeKind: "none", acceptMode: "exact" },
    navigation: {
      bookId: bookId ?? "",
      lessonId: lesson.lessonId ?? lesson.id,
      stepId,
      stepIndex: Math.max(0, stepIndex),
      totalSteps,
      previousStepId,
      nextStepId,
    },
    stepIndex: Math.max(0, stepIndex),
    totalSteps,
    previousStepId,
    nextStepId,
  };
}

