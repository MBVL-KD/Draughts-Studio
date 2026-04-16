import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import type {
  AskSequenceInteraction,
  ExpectedMoveSpec,
  MoveConstraintSet,
} from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { HighlightSpec } from "../types/presentationTypes";
import { readLocalizedText } from "./i18nHelpers";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";

export type AskSequenceAttemptKind = "success" | "wrong" | "illegal" | "progress";

export type AskSequenceAttemptResult = {
  kind: AskSequenceAttemptKind;
  message: string;
  nextFailedCount: number;
  allowFurtherInput: boolean;
  coachCaption?: string;
  feedbackHighlights?: HighlightSpec[];
  /** After `progress` or `success` in ordered mode: satisfied ply count. */
  nextOrderedIndex?: number;
  /** After `progress` in unordered mode: indices still unmatched. */
  nextPoolRemaining?: number[];
};

function arraysEqualOrdered<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function arraysEqualAsSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((value, index) => value === bs[index]);
}

function expectedPath(spec: ExpectedMoveSpec): number[] {
  if (spec.path && spec.path.length >= 2) return spec.path;
  return [spec.from, spec.to];
}

function attemptMatchesExpected(attempt: RecordedMove, spec: ExpectedMoveSpec): boolean {
  const ap =
    attempt.path && attempt.path.length >= 2 ? attempt.path : [attempt.from, attempt.to];
  if (spec.path && spec.path.length >= 2) {
    const ep = expectedPath(spec);
    if (!arraysEqualOrdered(ep, ap)) return false;
  } else {
    if (attempt.from !== spec.from || attempt.to !== spec.to) return false;
  }
  if (spec.captures != null && spec.captures.length > 0) {
    if (!arraysEqualAsSet(spec.captures, attempt.captures)) return false;
  }
  return true;
}

function rowOfSquare(square: number): number {
  return Math.floor((square - 1) / 5);
}

function isBackwardManStep(boardBefore: BoardState, attempt: RecordedMove): boolean {
  const piece: PieceCode = boardBefore.squares[attempt.from];
  if (piece !== "wm" && piece !== "bm") return false;
  if (attempt.captures.length > 0) return false;
  const r0 = rowOfSquare(attempt.from);
  const r1 = rowOfSquare(attempt.to);
  if (piece === "wm") return r1 > r0;
  if (piece === "bm") return r1 < r0;
  return false;
}

function violatesConstraints(
  boardBefore: BoardState,
  attempt: RecordedMove,
  constraints: MoveConstraintSet | undefined
): boolean {
  if (!constraints) return false;
  if (
    constraints.allowedFromSquares != null &&
    constraints.allowedFromSquares.length > 0 &&
    !constraints.allowedFromSquares.includes(attempt.from)
  ) {
    return true;
  }
  if (
    constraints.allowedToSquares != null &&
    constraints.allowedToSquares.length > 0 &&
    !constraints.allowedToSquares.includes(attempt.to)
  ) {
    return true;
  }
  if (constraints.requireCapture && attempt.captures.length === 0) {
    return true;
  }
  if (constraints.forbidBackwardMove && isBackwardManStep(boardBefore, attempt)) {
    return true;
  }
  return false;
}

function firstIllegalMessage(
  moment: StepMoment,
  language: LanguageCode,
  fallback: string
): string {
  const first = moment.illegalResponses?.[0]?.message;
  const t = readLocalizedText(first, language).trim();
  return t || fallback;
}

function wrongHintHighlights(
  momentId: string,
  squares: number[] | undefined
): HighlightSpec[] | undefined {
  const sq = squares?.filter((n) => typeof n === "number" && n >= 1 && n <= 50);
  if (!sq?.length) return undefined;
  return [
    {
      id: `ask-seq-wrong-hint:${momentId}`,
      squares: [...new Set(sq)],
      color: "warning",
      pulse: true,
      fill: true,
      outline: true,
    },
  ];
}

function expectedSpecHintSquares(
  spec: ExpectedMoveSpec | undefined,
  hintType: "from" | "to" | "from_to" | "path" | "captures" | "last_capture_leg"
): number[] {
  if (!spec) return [];
  const from = Number(spec.from);
  const to = Number(spec.to);
  const path =
    Array.isArray(spec.path) && spec.path.length >= 2
      ? spec.path.filter((n) => Number.isFinite(n))
      : Number.isFinite(from) && Number.isFinite(to)
        ? [from, to]
        : [];
  const captures =
    Array.isArray(spec.captures) && spec.captures.length > 0
      ? spec.captures.filter((n) => Number.isFinite(n))
      : [];
  switch (hintType) {
    case "from":
      return Number.isFinite(from) ? [from] : [];
    case "to":
      return Number.isFinite(to) ? [to] : [];
    case "from_to":
      return [from, to].filter((n) => Number.isFinite(n));
    case "path":
      return path;
    case "captures":
      return captures;
    case "last_capture_leg": {
      const leg = path.length >= 2 ? [path[path.length - 2], path[path.length - 1]] : [];
      const tailCapture = captures.length > 0 ? [captures[captures.length - 1]] : [];
      return [...leg, ...tailCapture].filter((n) => Number.isFinite(n));
    }
    default:
      return [];
  }
}

function pickHintPlanSquares(
  interaction: AskSequenceInteraction | null,
  spec: ExpectedMoveSpec | undefined,
  failedCount: number
): number[] | undefined {
  if (!interaction || failedCount <= 0) return undefined;
  const plan = Array.isArray(interaction.hintPlan) ? interaction.hintPlan : [];
  if (plan.length === 0) return undefined;
  let picked: (typeof plan)[number] | null = null;
  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i]!;
    const threshold =
      typeof step.afterFailedAttempts === "number" && Number.isFinite(step.afterFailedAttempts)
        ? Math.max(1, Math.floor(step.afterFailedAttempts))
        : i + 1;
    if (failedCount >= threshold) picked = step;
  }
  if (!picked) return undefined;
  const sq = expectedSpecHintSquares(spec, picked.type);
  return sq.length > 0 ? sq : undefined;
}

function coachLine(
  interaction: AskSequenceInteraction | null,
  which: "success" | "wrong",
  language: LanguageCode
): string | undefined {
  if (!interaction) return undefined;
  const src =
    which === "success" ? interaction.successCoachCaption : interaction.wrongCoachCaption;
  const t = readLocalizedText(src, language).trim();
  return t || undefined;
}

export type AskSequenceEvalContext = {
  boardBefore: BoardState;
  attempt: RecordedMove;
  priorFailedCount: number;
  language: LanguageCode;
  /** Number of plies already matched in ordered mode. */
  orderedIndex: number;
  /** Remaining expected indices in unordered mode; ignored when `requireExactOrder` is true. */
  poolRemaining?: number[] | null;
};

/**
 * Pure: evaluate one completed ply for an `askSequence` authoring moment.
 */
export function evaluateAskSequenceAttempt(
  moment: StepMoment,
  context: AskSequenceEvalContext
): AskSequenceAttemptResult {
  const { boardBefore, attempt, priorFailedCount, language, orderedIndex, poolRemaining } =
    context;

  const interaction =
    moment.type === "askSequence" && moment.interaction?.kind === "askSequence"
      ? moment.interaction
      : null;

  const maxAttempts = Math.max(1, interaction?.maxAttempts ?? 1);
  const allowRetry = interaction?.allowRetry !== false;
  const requireOrder = interaction?.requireExactOrder !== false;
  const seq = interaction?.expectedSequence ?? [];

  const fail = (
    kind: "illegal" | "wrong",
    message: string,
    targetSpec?: ExpectedMoveSpec
  ): AskSequenceAttemptResult => {
    const nextFailed = priorFailedCount + 1;
    const exhausted = !allowRetry || nextFailed >= maxAttempts;
    const dynamicHintSquares = pickHintPlanSquares(interaction, targetSpec, nextFailed);
    const fallbackHintSquares = interaction?.wrongHintHighlightSquares;
    return {
      kind,
      message,
      nextFailedCount: nextFailed,
      allowFurtherInput: !exhausted,
      coachCaption: coachLine(interaction, "wrong", language),
      feedbackHighlights: wrongHintHighlights(moment.id, dynamicHintSquares ?? fallbackHintSquares),
      nextOrderedIndex: 0,
      nextPoolRemaining: requireOrder ? undefined : [...seq.keys()],
    };
  };

  const successFull = (message: string): AskSequenceAttemptResult => ({
    kind: "success",
    message,
    nextFailedCount: 0,
    allowFurtherInput: false,
    coachCaption: coachLine(interaction, "success", language),
    nextOrderedIndex: seq.length,
    nextPoolRemaining: requireOrder ? undefined : [],
  });

  const progress = (
    message: string,
    nextOrdered: number,
    nextPool: number[] | undefined
  ): AskSequenceAttemptResult => ({
    kind: "progress",
    message,
    nextFailedCount: 0,
    allowFurtherInput: true,
    coachCaption: coachLine(interaction, "success", language),
    nextOrderedIndex: nextOrdered,
    nextPoolRemaining: nextPool,
  });

  if (!interaction) {
    return fail(
      "wrong",
      language === "nl"
        ? "Dit moment is geen askSequence-interactie."
        : "This moment is not an askSequence interaction."
    );
  }

  // If the sequence is already complete, keep returning success and never downgrade to illegal
  // on extra clicks/drags after completion.
  if (requireOrder && orderedIndex >= seq.length && seq.length > 0) {
    return successFull(
      readLocalizedText(moment.caption, language).trim() ||
        (language === "nl" ? "Volgorde al voltooid." : "Sequence already complete.")
    );
  }
  if (!requireOrder) {
    const pool =
      poolRemaining && poolRemaining.length > 0 ? [...poolRemaining] : [...seq.keys()];
    if (seq.length > 0 && pool.length === 0) {
      return successFull(
        readLocalizedText(moment.caption, language).trim() ||
          (language === "nl" ? "Alle zetten uit de set gehaald!" : "All required moves played!")
      );
    }
  }

  if (!resolveNotationToEngineMove(boardBefore, attempt.notation)) {
    const targetSpec = requireOrder
      ? seq[Math.min(Math.max(orderedIndex, 0), Math.max(0, seq.length - 1))]
      : undefined;
    const msg = firstIllegalMessage(
      moment,
      language,
      language === "nl" ? "Die zet is hier niet legaal." : "That move is not legal here."
    );
    return fail("illegal", msg, targetSpec);
  }

  if (violatesConstraints(boardBefore, attempt, moment.constraints)) {
    const targetSpec = requireOrder
      ? seq[Math.min(Math.max(orderedIndex, 0), Math.max(0, seq.length - 1))]
      : undefined;
    const msg = firstIllegalMessage(
      moment,
      language,
      language === "nl" ? "Die zet mag niet in deze les." : "That move is not allowed in this lesson."
    );
    return fail("illegal", msg, targetSpec);
  }

  if (seq.length === 0) {
    return fail(
      "wrong",
      language === "nl"
        ? "Stel minstens één verwachte zet in de volgorde in."
        : "Configure at least one move in the expected sequence."
    );
  }

  const wrongMsg =
    readLocalizedText(interaction.wrongMessage, language).trim() ||
    (language === "nl" ? "Niet de bedoelde zet in deze volgorde." : "Not the intended move in this sequence.");

  if (requireOrder) {
    if (orderedIndex < 0 || orderedIndex > seq.length) {
      return fail("wrong", wrongMsg);
    }
    if (orderedIndex === seq.length) {
      return successFull(
        readLocalizedText(moment.caption, language).trim() ||
          (language === "nl" ? "Volgorde al voltooid." : "Sequence already complete.")
      );
    }
    const spec = seq[orderedIndex]!;
    if (!attemptMatchesExpected(attempt, spec)) {
      return fail("wrong", wrongMsg);
    }
    const next = orderedIndex + 1;
    if (next >= seq.length) {
      return successFull(
        readLocalizedText(moment.caption, language).trim() ||
          (language === "nl" ? "Hele volgorde goed!" : "Full sequence correct!")
      );
    }
    return progress(
      language === "nl" ? `Zet ${next}/${seq.length} — ga verder.` : `Move ${next}/${seq.length} — keep going.`,
      next,
      undefined
    );
  }

  const pool =
    poolRemaining && poolRemaining.length > 0 ? [...poolRemaining] : [...seq.keys()];
  let matchedIdx = -1;
  for (const i of pool) {
    const spec = seq[i];
    if (spec && attemptMatchesExpected(attempt, spec)) {
      matchedIdx = i;
      break;
    }
  }
  if (matchedIdx < 0) {
    return fail("wrong", wrongMsg);
  }
  const nextPool = pool.filter((i) => i !== matchedIdx);
  if (nextPool.length === 0) {
    return successFull(
      readLocalizedText(moment.caption, language).trim() ||
        (language === "nl" ? "Alle zetten uit de set gehaald!" : "All required moves played!")
    );
  }
  return progress(
    language === "nl"
      ? `Nog ${nextPool.length} zet(ten) uit de set.`
      : `${nextPool.length} move(s) left in the set.`,
    orderedIndex,
    nextPool
  );
}
