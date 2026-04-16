import type { LessonStep } from "../types/stepTypes";
import type {
  LessonStepPlaybackPayload,
  PlaybackEvent,
  PlaybackNode,
} from "../types/playbackPayloadTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "./i18nHelpers";

function normalizedMoves(step: LessonStep): string[] {
  return (step.presentation?.autoplay?.moves ?? [])
    .map((move) => move.trim())
    .filter(Boolean);
}

function buildNodesFromStep(step: LessonStep): PlaybackNode[] {
  const timeline = step.sourceRef?.nodeTimeline ?? [];
  if (timeline.length === 0) return [];

  return timeline.map((item, index) => ({
    id: item.nodeId,
    ply: item.plyIndex,
    notation: item.notation,
    fenAfter: item.fenAfter,
    parentId: index === 0 ? null : timeline[index - 1]?.nodeId ?? null,
    childrenIds: index < timeline.length - 1 ? [timeline[index + 1]!.nodeId] : [],
  }));
}

function buildEventsFromStep(step: LessonStep, language: LanguageCode): PlaybackEvent[] {
  const timeline = step.sourceRef?.nodeTimeline ?? [];
  const events: PlaybackEvent[] = [];

  for (const item of timeline) {
    const pre = readLocalizedText(item.preMoveComment, language).trim();
    const post = readLocalizedText(item.comment, language).trim();
    if (pre) {
      events.push({
        type: "pre_comment",
        ply: item.plyIndex,
        text: pre,
      });
    }
    if (item.glyphs && item.glyphs.length > 0) {
      events.push({
        type: "glyphs",
        ply: item.plyIndex,
        glyphs: item.glyphs,
      });
    }
    if (post) {
      events.push({
        type: "post_comment",
        ply: item.plyIndex,
        text: post,
      });
    }
    const nh = item.highlights?.length ? item.highlights : undefined;
    const na = item.arrows?.length ? item.arrows : undefined;
    const nr = item.routes?.length ? item.routes : undefined;
    if (nh || na || nr) {
      events.push({
        type: "overlay",
        ply: item.plyIndex,
        highlights: nh ?? [],
        arrows: na ?? [],
        routes: nr ?? [],
      });
    }
  }

  events.push({
    type: "overlay",
    ply: 0,
    highlights: step.presentation?.highlights ?? [],
    arrows: step.presentation?.arrows ?? [],
    routes: step.presentation?.routes ?? [],
  });

  return events;
}

export function buildStepPlaybackPayload(
  step: LessonStep,
  language: LanguageCode = "en"
): LessonStepPlaybackPayload {
  return {
    schemaVersion: "lesson-step-playback.v1",
    stepId: step.id,
    stepType: step.type,
    title: readLocalizedText(step.title, language),
    prompt: readLocalizedText(step.prompt, language),
    initialFen: step.initialState?.fen ?? "",
    sideToMove: step.initialState?.sideToMove ?? "white",
    lineMode: step.sourceRef?.lineMode ?? "custom",
    sourceId: step.sourceRef?.sourceId,
    startNodeId: step.sourceRef?.startNodeId ?? null,
    endNodeId: step.sourceRef?.endNodeId ?? null,
    nodes: buildNodesFromStep(step),
    autoplayMoves: normalizedMoves(step),
    events: buildEventsFromStep(step, language),
  };
}

