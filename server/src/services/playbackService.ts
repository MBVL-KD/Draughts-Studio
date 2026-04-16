import { parsePlaybackPayloadShape } from "../validation/playbackSchemas";
import { ValidationError } from "../utils/httpErrors";
import { buildPlaybackHintPayload } from "../playback/buildPlaybackHint";
import { buildRuntimeValidationBlockWithAuthoring } from "../playback/buildRuntimeValidation";

type LocalizedTextLike = {
  values?: Record<string, string>;
};

type SourceNodeSnapshotLike = {
  nodeId?: string;
  plyIndex?: number;
  notation?: string;
  fenAfter?: string;
  glyphs?: string[];
  preMoveComment?: LocalizedTextLike;
  comment?: LocalizedTextLike;
};

export type PlaybackNavigationMeta = {
  bookId: string;
  lessonId: string;
  stepId: string;
  /** 0-based index in the lesson `steps` array (book order). */
  stepIndex: number;
  totalSteps: number;
  previousStepId: string | null;
  nextStepId: string | null;
};

type StepLike = {
  id?: string;
  stepId?: string;
  type?: string;
  title?: LocalizedTextLike;
  prompt?: LocalizedTextLike;
  hint?: LocalizedTextLike;
  initialState?: {
    fen?: string;
    sideToMove?: "white" | "black";
    startFen?: string;
    boardFen?: string;
    snapshotFen?: string;
  };
  validation?: Record<string, unknown>;
  puzzleMeta?: unknown;
  runtimeHints?: Record<string, string | number | boolean | null>;
  sourceRef?: {
    sourceId?: string;
    startNodeId?: string | null;
    endNodeId?: string | null;
    lineMode?: "mainline" | "variation" | "custom";
    nodeTimeline?: SourceNodeSnapshotLike[];
  };
  presentation?: {
    autoplay?: {
      moves?: string[];
    };
    highlights?: unknown[];
    arrows?: unknown[];
    routes?: unknown[];
  };
};

function readLocalizedText(value: LocalizedTextLike | undefined, language: string): string {
  if (!value?.values) return "";
  return value.values[language] ?? value.values.en ?? "";
}

function resolveInitialFen(step: StepLike): string {
  return (
    step.initialState?.fen ??
    step.initialState?.startFen ??
    step.initialState?.boardFen ??
    step.initialState?.snapshotFen ??
    ""
  );
}

export function buildPlaybackPayload(params: {
  step: StepLike;
  language?: string;
  /** From parent lesson; used by runtime (Scan variant mapping). */
  variantId?: string;
  lessonId?: string;
  /** Optional authoring step context for v2-derived runtime fallback. */
  authoringStep?: unknown;
  /** Lesson position in book order; omit for callers without lesson context. */
  navigation?: PlaybackNavigationMeta;
}) {
  const step = params.step;
  const language = params.language ?? "en";
  const variantId =
    typeof params.variantId === "string" && params.variantId.trim()
      ? params.variantId.trim()
      : "international";
  const timeline = step.sourceRef?.nodeTimeline ?? [];

  const nodes = timeline
    .map((item, index) => ({
      id: item.nodeId ?? `node-${index + 1}`,
      ply: item.plyIndex ?? index + 1,
      notation: item.notation,
      fenAfter: item.fenAfter,
      parentId: index > 0 ? (timeline[index - 1]?.nodeId ?? `node-${index}`) : null,
      childrenIds:
        index < timeline.length - 1
          ? [timeline[index + 1]?.nodeId ?? `node-${index + 2}`]
          : [],
    }))
    .sort((a, b) => a.ply - b.ply);

  const events = timeline
    .flatMap((item) => {
      const ply = item.plyIndex ?? 0;
      const parts = [];
      const pre = readLocalizedText(item.preMoveComment, language).trim();
      if (pre) {
        parts.push({
          type: "pre_comment" as const,
          ply,
          text: pre,
        });
      }
      if (item.glyphs && item.glyphs.length > 0) {
        parts.push({
          type: "glyphs" as const,
          ply,
          glyphs: item.glyphs,
        });
      }
      const post = readLocalizedText(item.comment, language).trim();
      if (post) {
        parts.push({
          type: "post_comment" as const,
          ply,
          text: post,
        });
      }
      return parts;
    })
    .sort((a, b) => a.ply - b.ply);

  events.push({
    type: "overlay",
    ply: 0,
    highlights: step.presentation?.highlights ?? [],
    arrows: step.presentation?.arrows ?? [],
    routes: step.presentation?.routes ?? [],
  });

  const { validation: runtimeValidation, puzzleScan } = buildRuntimeValidationBlockWithAuthoring(
    step,
    params.authoringStep as Parameters<typeof buildRuntimeValidationBlockWithAuthoring>[1]
  );
  const hintPayload = buildPlaybackHintPayload(step, language);

  const payload = {
    payloadType: "lesson-step-playback" as const,
    payloadVersion: 2 as const,
    stepId: step.stepId ?? step.id ?? "",
    lessonId: params.lessonId,
    stepType: step.type ?? "",
    title: readLocalizedText(step.title, language),
    prompt: readLocalizedText(step.prompt, language),
    initialFen: resolveInitialFen(step),
    sideToMove: step.initialState?.sideToMove ?? "white",
    variantId,
    lineMode: step.sourceRef?.lineMode ?? "custom",
    sourceId: step.sourceRef?.sourceId,
    startNodeId: step.sourceRef?.startNodeId ?? null,
    endNodeId: step.sourceRef?.endNodeId ?? null,
    nodes,
    autoplayMoves: (step.presentation?.autoplay?.moves ?? []).filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    ),
    events,
    validation: runtimeValidation,
    puzzleScan,
    ...(params.navigation ? { navigation: params.navigation } : {}),
    ...(params.navigation
      ? {
          stepIndex: params.navigation.stepIndex,
          totalSteps: params.navigation.totalSteps,
          previousStepId: params.navigation.previousStepId,
          nextStepId: params.navigation.nextStepId,
        }
      : {}),
    ...(hintPayload ? { hint: hintPayload } : {}),
  };

  const parsed = parsePlaybackPayloadShape(payload);
  if (!parsed.result.ok || !parsed.parsed) {
    throw new ValidationError("Playback payload validation failed", parsed.result.issues);
  }

  return parsed.parsed;
}

