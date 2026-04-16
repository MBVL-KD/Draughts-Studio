import type {
  AskSelectPiecesInteraction,
  AskSelectSquaresInteraction,
} from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { HighlightSpec } from "../types/presentationTypes";
import { squareSetMatchesTargets } from "./compareSquareSelections";
import { readLocalizedText } from "./i18nHelpers";

export type AskSquarePickEvalResult = {
  status: "success" | "incorrect";
  feedback: string;
  coachCaption: string;
  feedbackHighlights?: HighlightSpec[];
  allowFurtherInput: boolean;
  nextFailedCount: number;
};

type PickIx = AskSelectSquaresInteraction | AskSelectPiecesInteraction;

function hintHighlights(ix: PickIx): HighlightSpec[] | undefined {
  const sq = ix.hintSquares ?? [];
  if (!sq.length) return undefined;
  return [
    {
      id: "ask-pick-hint",
      squares: [...new Set(sq)],
      color: "warning",
      pulse: true,
      fill: true,
      outline: true,
    },
  ];
}

/**
 * Shared evaluator for askSelectSquares / askSelectPieces (same data shape).
 */
export function runSquarePickEvaluation(
  ix: PickIx,
  semantic: "squares" | "pieces",
  selectedSquares: number[],
  priorFailedCount: number,
  language: LanguageCode
): AskSquarePickEvalResult {
  const maxAttempts = Math.max(1, ix.maxAttempts ?? 5);
  const allowRetry = ix.allowRetry !== false;
  const requireExact = ix.requireExactSet !== false;
  const targets = ix.targetSquares ?? [];
  const ok = squareSetMatchesTargets(selectedSquares, targets, requireExact);

  if (ok) {
    const coach = readLocalizedText(ix.successCoachCaption, language).trim();
    return {
      status: "success",
      feedback: language === "nl" ? "Correcte selectie." : "Correct selection.",
      coachCaption: coach,
      allowFurtherInput: false,
      nextFailedCount: 0,
    };
  }

  const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
  const defaultWrong =
    semantic === "pieces"
      ? language === "nl"
        ? "De selectie (stukken) klopt nog niet."
        : "The piece selection is not correct yet."
      : language === "nl"
        ? "De selectie klopt nog niet."
        : "The selection is not correct yet.";

  const next = priorFailedCount + 1;
  const maxed = next >= maxAttempts;
  const coach = readLocalizedText(ix.wrongCoachCaption, language).trim();

  return {
    status: "incorrect",
    feedback: wrongPlain || defaultWrong,
    coachCaption: coach,
    feedbackHighlights: hintHighlights(ix),
    allowFurtherInput: allowRetry && !maxed,
    nextFailedCount: next,
  };
}

function wrongSquaresType(language: LanguageCode): AskSquarePickEvalResult {
  return {
    status: "incorrect",
    feedback:
      language === "nl"
        ? "Dit moment is geen askSelectSquares-interactie."
        : "This moment is not an askSelectSquares interaction.",
    coachCaption: "",
    allowFurtherInput: false,
    nextFailedCount: 0,
  };
}

export function evaluateAskSelectSquaresAttempt(
  moment: StepMoment,
  selectedSquares: number[],
  priorFailedCount: number,
  language: LanguageCode
): AskSquarePickEvalResult {
  if (moment.type !== "askSelectSquares" || moment.interaction?.kind !== "askSelectSquares") {
    return wrongSquaresType(language);
  }
  return runSquarePickEvaluation(moment.interaction, "squares", selectedSquares, priorFailedCount, language);
}
