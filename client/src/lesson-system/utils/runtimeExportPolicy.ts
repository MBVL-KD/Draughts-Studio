/**
 * Mirror of `server/src/playback/runtimeExportPolicy.ts` — keep in sync.
 */

export type AuthoringTimelineMomentLike = { type?: string };

export type AuthoringStepExportLike = {
  timeline?: AuthoringTimelineMomentLike[];
};

type StepExportLike = {
  validation?: { type?: string };
  sourceRef?: {
    nodeTimeline?: Array<{ notation?: string; fenAfter?: string }>;
  };
  presentation?: {
    autoplay?: { moves?: unknown[] };
  };
};

const TEXT_ONLY_TIMELINE_TYPES = new Set(["introText", "summary", "checkpoint"]);

const USER_INTERACTION_MOMENT_TYPES = new Set([
  "askMove",
  "askSequence",
  "askCount",
  "askSelectSquares",
  "askSelectPieces",
  "multipleChoice",
  "placePieces",
]);

const LEGACY_VALIDATION_REQUIRING_BOARD = new Set([
  "move",
  "sequence",
  "count",
  "select_squares",
  "select_pieces",
  "multiple_choice",
  "place_pieces",
  "mark_path",
  "zone_paint",
  "goal",
]);

function timelineTypes(authoringStep?: AuthoringStepExportLike): string[] {
  const tl = authoringStep?.timeline;
  if (!Array.isArray(tl)) return [];
  return tl
    .map((m) => (m && typeof m.type === "string" ? m.type.trim() : ""))
    .filter(Boolean);
}

export function allowsEmptyInitialFenForRuntimeExport(params: {
  step: StepExportLike;
  authoringStep?: AuthoringStepExportLike;
}): boolean {
  const rawTypeEarly = params.step.validation?.type;
  const vTypeEarly =
    typeof rawTypeEarly === "string" && rawTypeEarly.trim() ? rawTypeEarly.trim() : "none";

  const types = timelineTypes(params.authoringStep);
  if (types.length > 0) {
    const allTextOnly = types.every((t) => TEXT_ONLY_TIMELINE_TYPES.has(t));
    if (!allTextOnly) return false;
    if (vTypeEarly !== "none" && LEGACY_VALIDATION_REQUIRING_BOARD.has(vTypeEarly)) {
      return false;
    }
    return true;
  }

  const rawType = params.step.validation?.type;
  const vType = typeof rawType === "string" && rawType.trim() ? rawType.trim() : "none";
  if (vType !== "none" && LEGACY_VALIDATION_REQUIRING_BOARD.has(vType)) {
    return false;
  }

  const nodeTimeline = params.step.sourceRef?.nodeTimeline;
  if (Array.isArray(nodeTimeline) && nodeTimeline.length > 0) {
    const hasBoardLine = nodeTimeline.some((n) => {
      const notation = typeof n?.notation === "string" ? n.notation.trim() : "";
      const fenAfter = typeof n?.fenAfter === "string" ? n.fenAfter.trim() : "";
      return Boolean(notation || fenAfter);
    });
    if (hasBoardLine) return false;
  }

  const moves = params.step.presentation?.autoplay?.moves;
  if (Array.isArray(moves) && moves.some((m) => typeof m === "string" && m.trim())) {
    return false;
  }

  return true;
}

export function requiresLocalizedFeedbackForRuntimeExport(params: {
  step: StepExportLike;
  authoringStep?: AuthoringStepExportLike;
}): boolean {
  for (const t of timelineTypes(params.authoringStep)) {
    if (USER_INTERACTION_MOMENT_TYPES.has(t)) return true;
  }

  const rawType = params.step.validation?.type;
  const vType = typeof rawType === "string" && rawType.trim() ? rawType.trim() : "none";
  if (!vType || vType === "none") return false;
  return LEGACY_VALIDATION_REQUIRING_BOARD.has(vType);
}
