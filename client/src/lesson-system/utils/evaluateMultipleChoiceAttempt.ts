import type { MultipleChoiceInteraction } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "./i18nHelpers";

export type MultipleChoiceEvalResult = {
  status: "success" | "incorrect";
  message: string;
  coachCaption: string;
  allowFurtherInput: boolean;
  nextFailedCount: number;
};

function wrongType(language: LanguageCode): MultipleChoiceEvalResult {
  return {
    status: "incorrect",
    message:
      language === "nl"
        ? "Dit moment is geen meerkeuze-interactie."
        : "This moment is not a multiple-choice interaction.",
    coachCaption: "",
    allowFurtherInput: false,
    nextFailedCount: 0,
  };
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]!);
}

function correctOptionIds(ix: MultipleChoiceInteraction): string[] {
  return (ix.options ?? []).filter((o) => o.isCorrect).map((o) => o.id);
}

/**
 * Pure: evaluate one submit for a `multipleChoice` authoring moment.
 */
export function evaluateMultipleChoiceAttempt(
  moment: StepMoment,
  selectedOptionIds: string[],
  priorFailedCount: number,
  language: LanguageCode
): MultipleChoiceEvalResult {
  if (moment.type !== "multipleChoice" || moment.interaction?.kind !== "multipleChoice") {
    return wrongType(language);
  }

  const ix = moment.interaction;
  const maxAttempts = Math.max(1, ix.maxAttempts ?? 5);
  const allowRetry = ix.allowRetry !== false;
  const allowMultiple = !!ix.allowMultiple;
  const options = ix.options ?? [];
  const correctIds = sortedUnique(correctOptionIds(ix));
  const chosen = sortedUnique(selectedOptionIds);

  if (options.length === 0 || correctIds.length === 0) {
    const msg =
      language === "nl"
        ? "Geen geldige opties of geen juiste optie ingesteld — pas de configuratie aan."
        : "No valid options or no correct option set — fix the configuration.";
    return {
      status: "incorrect",
      message: msg,
      coachCaption: "",
      allowFurtherInput: false,
      nextFailedCount: priorFailedCount,
    };
  }

  if (chosen.length === 0) {
    const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
    const msg =
      wrongPlain ||
      (language === "nl"
        ? "Selecteer eerst een optie."
        : "Select an option first.");
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

  if (!allowMultiple) {
    if (chosen.length > 1) {
      const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
      const msg =
        wrongPlain ||
        (language === "nl"
          ? "Kies precies één optie."
          : "Choose exactly one option.");
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
    const id = chosen[0]!;
    const validIds = new Set(options.map((o) => o.id));
    if (!validIds.has(id)) {
      const next = priorFailedCount + 1;
      const maxed = next >= maxAttempts;
      const coach = readLocalizedText(ix.wrongCoachCaption, language).trim();
      return {
        status: "incorrect",
        message:
          language === "nl" ? "Onbekende optie." : "Unknown option.",
        coachCaption: coach,
        allowFurtherInput: allowRetry && !maxed,
        nextFailedCount: next,
      };
    }
    const isCorrect = correctIds.includes(id);
    if (isCorrect) {
      const successCoach = readLocalizedText(ix.successCoachCaption, language).trim();
      const body = readLocalizedText(moment.body, language).trim();
      return {
        status: "success",
        message: language === "nl" ? "Correct!" : "Correct!",
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

  // Multi-select: exact set match
  if (setsEqual(chosen, correctIds)) {
    const successCoach = readLocalizedText(ix.successCoachCaption, language).trim();
    const body = readLocalizedText(moment.body, language).trim();
    return {
      status: "success",
      message: language === "nl" ? "Correct!" : "Correct!",
      coachCaption: successCoach || body,
      allowFurtherInput: false,
      nextFailedCount: 0,
    };
  }

  const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
  const msg =
    wrongPlain ||
    (language === "nl" ? "De combinatie klopt nog niet." : "That combination is not correct yet.");
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
