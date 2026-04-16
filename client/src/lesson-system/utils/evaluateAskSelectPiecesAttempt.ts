import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { AskSquarePickEvalResult } from "./evaluateAskSelectSquaresAttempt";
import { runSquarePickEvaluation } from "./evaluateAskSelectSquaresAttempt";

function wrongPiecesType(language: LanguageCode): AskSquarePickEvalResult {
  return {
    status: "incorrect",
    feedback:
      language === "nl"
        ? "Dit moment is geen askSelectPieces-interactie."
        : "This moment is not an askSelectPieces interaction.",
    coachCaption: "",
    allowFurtherInput: false,
    nextFailedCount: 0,
  };
}

/**
 * Pure: evaluate square selection for an `askSelectPieces` authoring moment (MVP = same set logic as squares).
 */
export function evaluateAskSelectPiecesAttempt(
  moment: StepMoment,
  selectedSquares: number[],
  priorFailedCount: number,
  language: LanguageCode
): AskSquarePickEvalResult {
  if (moment.type !== "askSelectPieces" || moment.interaction?.kind !== "askSelectPieces") {
    return wrongPiecesType(language);
  }
  return runSquarePickEvaluation(moment.interaction, "pieces", selectedSquares, priorFailedCount, language);
}
