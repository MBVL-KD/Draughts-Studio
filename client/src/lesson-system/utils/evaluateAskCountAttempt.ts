import type { AskCountInteraction } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "./i18nHelpers";

export type AskCountEvalResult = {
  status: "success" | "incorrect";
  message: string;
  coachCaption: string;
  allowFurtherInput: boolean;
  nextFailedCount: number;
};

function wrongType(language: LanguageCode): AskCountEvalResult {
  return {
    status: "incorrect",
    message:
      language === "nl"
        ? "Dit moment is geen askCount-interactie."
        : "This moment is not an askCount interaction.",
    coachCaption: "",
    allowFurtherInput: false,
    nextFailedCount: 0,
  };
}

function isAccepted(ix: AskCountInteraction, value: number): boolean {
  if (value === ix.correctValue) return true;
  const alt = ix.acceptedValues ?? [];
  return alt.some((n) => n === value);
}

/**
 * Pure: evaluate one submitted integer for an `askCount` authoring moment.
 */
export function evaluateAskCountAttempt(
  moment: StepMoment,
  enteredValue: number | null,
  priorFailedCount: number,
  language: LanguageCode
): AskCountEvalResult {
  if (moment.type !== "askCount" || moment.interaction?.kind !== "askCount") {
    return wrongType(language);
  }

  const ix = moment.interaction;
  const maxAttempts = Math.max(1, ix.maxAttempts ?? 5);
  const allowRetry = ix.allowRetry !== false;

  if (enteredValue == null || !Number.isFinite(enteredValue)) {
    const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
    const msg =
      wrongPlain ||
      (language === "nl" ? "Voer een geldig getal in." : "Enter a valid number.");
    const next = priorFailedCount + 1;
    const maxed = next >= maxAttempts;
    const coach = readLocalizedText(ix.wrongCoachCaption, language).trim();
    return {
      status: "incorrect",
      message: msg,
      coachCaption: coach,
      allowFurtherInput: allowRetry && !maxed,
      nextFailedCount: next,
    };
  }

  if (isAccepted(ix, enteredValue)) {
    const successCoach = readLocalizedText(ix.successCoachCaption, language).trim();
    const body = readLocalizedText(moment.body, language).trim();
    return {
      status: "success",
      message:
        language === "nl" ? "Correct!" : "Correct!",
      coachCaption: successCoach || body,
      allowFurtherInput: false,
      nextFailedCount: 0,
    };
  }

  const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
  const msg =
    wrongPlain ||
    (language === "nl" ? "Dat is niet het goede antwoord." : "That is not the correct answer.");
  const next = priorFailedCount + 1;
  const maxed = next >= maxAttempts;
  const coach = readLocalizedText(ix.wrongCoachCaption, language).trim();

  return {
    status: "incorrect",
    message: msg,
    coachCaption: coach,
    allowFurtherInput: allowRetry && !maxed,
    nextFailedCount: next,
  };
}
