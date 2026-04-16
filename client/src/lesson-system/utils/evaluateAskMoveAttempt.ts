import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import type {
  AskMoveInteraction,
  ExpectedMoveSpec,
  MoveConstraintSet,
} from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { HighlightSpec } from "../types/presentationTypes";
import { readLocalizedText } from "./i18nHelpers";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";

export type AskMoveAttemptKind = "success" | "illegal" | "wrong";

export type AskMoveAttemptResult = {
  kind: AskMoveAttemptKind;
  message: string;
  /** After this evaluation: number of failed tries (0 on success). */
  nextFailedCount: number;
  /** Whether the preview may accept another move (false after success or max-out). */
  allowFurtherInput: boolean;
  /** Optional second line (coach-style) for preview UI. */
  coachCaption?: string;
  /** Optional highlights merged in preview after wrong/illegal. */
  feedbackHighlights?: HighlightSpec[];
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
  const ep = expectedPath(spec);
  const ap =
    attempt.path && attempt.path.length >= 2 ? attempt.path : [attempt.from, attempt.to];
  if (!arraysEqualOrdered(ep, ap)) return false;
  if (spec.captures != null && spec.captures.length > 0) {
    if (!arraysEqualAsSet(spec.captures, attempt.captures)) return false;
  }
  return true;
}

function normalizeMoveMatch(
  moveMatch: ExpectedMoveSpec | ExpectedMoveSpec[]
): ExpectedMoveSpec[] {
  return Array.isArray(moveMatch) ? moveMatch : [moveMatch];
}

function rowOfSquare(square: number): number {
  return Math.floor((square - 1) / 5);
}

/**
 * Non-capture man step that retreats toward own baseline (MVP lesson rule).
 */
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
  interaction: AskMoveInteraction | null
): HighlightSpec[] | undefined {
  const sq = interaction?.wrongHintHighlightSquares?.filter(
    (n) => typeof n === "number" && n >= 1 && n <= 50
  );
  if (!sq?.length) return undefined;
  return [
    {
      id: `ask-move-wrong-hint:${momentId}`,
      squares: [...new Set(sq)],
      color: "warning",
      pulse: true,
      fill: true,
      outline: true,
    },
  ];
}

function coachLine(
  interaction: AskMoveInteraction | null,
  which: "success" | "wrong",
  language: LanguageCode
): string | undefined {
  if (!interaction) return undefined;
  const src =
    which === "success"
      ? interaction.successCoachCaption
      : interaction.wrongCoachCaption;
  const t = readLocalizedText(src, language).trim();
  return t || undefined;
}

/**
 * Pure: evaluate one completed move attempt for an `askMove` authoring moment.
 * Noop-safe when fields are missing.
 */
export function evaluateAskMoveAttempt(
  moment: StepMoment,
  context: {
    boardBefore: BoardState;
    attempt: RecordedMove;
    priorFailedCount: number;
    language: LanguageCode;
  }
): AskMoveAttemptResult {
  const { boardBefore, attempt, priorFailedCount, language } = context;

  const interaction =
    moment.type === "askMove" && moment.interaction?.kind === "askMove"
      ? moment.interaction
      : null;

  const maxAttempts = Math.max(1, interaction?.maxAttempts ?? 1);
  const allowRetry = interaction?.allowRetry === true;

  const fail = (
    kind: "illegal" | "wrong",
    message: string
  ): AskMoveAttemptResult => {
    const nextFailed = priorFailedCount + 1;
    const exhausted = !allowRetry || nextFailed >= maxAttempts;
    return {
      kind,
      message,
      nextFailedCount: nextFailed,
      allowFurtherInput: !exhausted,
      coachCaption: coachLine(interaction, "wrong", language),
      feedbackHighlights: wrongHintHighlights(moment.id, interaction),
    };
  };

  const success = (message: string): AskMoveAttemptResult => ({
    kind: "success",
    message,
    nextFailedCount: 0,
    allowFurtherInput: false,
    coachCaption: coachLine(interaction, "success", language),
  });

  if (!interaction) {
    return fail(
      "wrong",
      language === "nl"
        ? "Dit moment is geen askMove-interactie."
        : "This moment is not an askMove interaction."
    );
  }

  if (!resolveNotationToEngineMove(boardBefore, attempt.notation)) {
    const msg = firstIllegalMessage(
      moment,
      language,
      language === "nl" ? "Die zet is hier niet legaal." : "That move is not legal here."
    );
    return fail("illegal", msg);
  }

  if (violatesConstraints(boardBefore, attempt, moment.constraints)) {
    const msg = firstIllegalMessage(
      moment,
      language,
      language === "nl" ? "Die zet mag niet in deze les." : "That move is not allowed in this lesson."
    );
    return fail("illegal", msg);
  }

  const expected = interaction.expectedMoves ?? [];
  if (expected.length === 0) {
    return fail(
      "wrong",
      language === "nl"
        ? "Stel minstens één verwachte zet in (bewerker)."
        : "Configure at least one expected move (editor)."
    );
  }

  const policy = interaction.successPolicy ?? "anyExpected";
  const ok =
    policy === "exactOne"
      ? expected.length === 1 && attemptMatchesExpected(attempt, expected[0]!)
      : expected.some((spec) => attemptMatchesExpected(attempt, spec));

  if (ok) {
    const okMsg =
      readLocalizedText(moment.caption, language).trim() ||
      (language === "nl" ? "Goed zo." : "Well done.");
    return success(okMsg);
  }

  const strategic = moment.strategicResponses ?? [];
  for (const sr of strategic) {
    const specs = normalizeMoveMatch(sr.moveMatch);
    if (specs.some((spec) => attemptMatchesExpected(attempt, spec))) {
      const m = readLocalizedText(sr.message, language).trim();
      return fail(
        "wrong",
        m ||
          readLocalizedText(interaction.wrongMessage, language).trim() ||
          (language === "nl"
            ? "Dat is een andere bedoeling — probeer opnieuw."
            : "Not the intended idea — try again.")
      );
    }
  }

  const wrongMsg =
    readLocalizedText(interaction.wrongMessage, language).trim() ||
    (language === "nl" ? "Niet de bedoelde zet." : "Not the intended move.");
  return fail("wrong", wrongMsg);
}
