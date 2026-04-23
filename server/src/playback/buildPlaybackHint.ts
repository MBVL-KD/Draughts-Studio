import { resolveNotationLineToStructuredMovesDetailed } from "./resolveNotationLineToStructuredMoves";

type LocalizedTextLike = {
  values?: Record<string, string>;
};

type StepLike = {
  initialState?: { fen?: string };
  validation?: Record<string, unknown>;
  hint?: LocalizedTextLike;
  sourceRef?: {
    nodeTimeline?: Array<{ notation?: string }>;
  };
};

function readLocalizedText(value: LocalizedTextLike | undefined, language: string): string {
  if (!value?.values) return "";
  return value.values[language] ?? value.values.en ?? "";
}

function resolveInitialFen(step: StepLike): string {
  return (step.initialState?.fen ?? "").trim();
}

function pickSequenceNotations(step: StepLike, moves: string[]): string[] {
  const timeline = step.sourceRef?.nodeTimeline ?? [];
  if (timeline.length === moves.length && moves.length > 0) {
    return moves.map((fallback, i) => {
      const n = timeline[i]?.notation;
      return typeof n === "string" && n.trim() ? n.trim() : fallback;
    });
  }
  return moves;
}

export type PlaybackHintPayload = {
  text?: string;
  expectedFrom?: number;
  expectedTo?: number;
};

/**
 * Lightweight hint for runtime (e.g. Roblox): localized hint text plus first expected
 * move squares when move/sequence validation resolves on the step FEN.
 */
export function buildPlaybackHintPayload(
  step: StepLike,
  language: string
): PlaybackHintPayload | null {
  const text = readLocalizedText(step.hint, language).trim();

  const initialFen = resolveInitialFen(step);
  const validation = step.validation ?? {};
  const vType = typeof validation.type === "string" ? validation.type : "none";

  let firstNotation: string | null = null;
  if (vType === "move") {
    const correct = Array.isArray(validation.correctMoves)
      ? (validation.correctMoves as unknown[]).map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];
    firstNotation = correct[0] ?? null;
  } else if (vType === "sequence") {
    const rawMoves = Array.isArray(validation.moves)
      ? (validation.moves as unknown[]).map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];
    const notations = pickSequenceNotations(step, rawMoves);
    firstNotation = notations[0] ?? null;
  }

  let expectedFrom: number | undefined;
  let expectedTo: number | undefined;
  if (firstNotation && initialFen) {
    const one = resolveNotationLineToStructuredMovesDetailed(initialFen, [firstNotation]);
    if (one.ok && one.moves.length === 1) {
      const m = one.moves[0];
      expectedFrom = m.from;
      expectedTo = m.to;
    }
  }

  const hasText = text.length > 0;
  const hasSquares =
    expectedFrom !== undefined &&
    expectedTo !== undefined &&
    Number.isFinite(expectedFrom) &&
    Number.isFinite(expectedTo);

  if (!hasText && !hasSquares) return null;

  const out: PlaybackHintPayload = {};
  if (hasText) out.text = text;
  if (hasSquares) {
    out.expectedFrom = expectedFrom;
    out.expectedTo = expectedTo;
  }
  return out;
}

/**
 * V2-native hint builder: reads hint text from runtimeHints and first expected
 * move from the askSequence moment in the timeline.
 */
export function buildPlaybackHintFromV2Step(
  step: Record<string, unknown>,
  language: string
): PlaybackHintPayload | null {
  const hints = step.runtimeHints as Record<string, unknown> | undefined;
  const hintText = typeof hints?.scanBestMove === "string" ? hints.scanBestMove : "";

  const initialState = step.initialState as Record<string, unknown> | undefined;
  const initialFen = String(initialState?.fen ?? "").trim();

  const timeline = Array.isArray(step.timeline) ? step.timeline : [];
  const askMoment = timeline.find((m: unknown) => {
    const moment = m as Record<string, unknown>;
    return (
      moment?.type === "askSequence" &&
      (moment.interaction as Record<string, unknown> | undefined)?.kind === "askSequence"
    );
  }) as Record<string, unknown> | undefined;

  const interaction = askMoment?.interaction as Record<string, unknown> | undefined;
  const expectedSequence = Array.isArray(interaction?.expectedSequence)
    ? (interaction.expectedSequence as Record<string, unknown>[])
    : [];

  let expectedFrom: number | undefined;
  let expectedTo: number | undefined;

  if (expectedSequence.length > 0 && initialFen) {
    const first = expectedSequence[0];
    const from = Number(first?.from);
    const to = Number(first?.to);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      expectedFrom = from;
      expectedTo = to;
    }
  }

  const hasText = hintText.trim().length > 0;
  const hasSquares = expectedFrom !== undefined && expectedTo !== undefined;
  if (!hasText && !hasSquares) return null;

  const out: PlaybackHintPayload = {};
  if (hasText) out.text = hintText.trim();
  if (hasSquares) {
    out.expectedFrom = expectedFrom;
    out.expectedTo = expectedTo;
  }
  return out;
}
