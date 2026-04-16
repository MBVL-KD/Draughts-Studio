import type { StepMoment, StepMomentType } from "../types/authoring/timelineTypes";
import { createLocalizedText } from "./i18nHelpers";

const MVP_MOMENT_TYPES: StepMomentType[] = [
  "introText",
  "focusBoard",
  "showMove",
  "showLine",
  "askMove",
  "askSequence",
  "askCount",
  "askSelectSquares",
  "askSelectPieces",
  "multipleChoice",
  "placePieces",
  "summary",
  "checkpoint",
];

export function listQuickAddMomentTypes(): readonly StepMomentType[] {
  return MVP_MOMENT_TYPES;
}

export function createMoment(type: StepMomentType): StepMoment {
  const id = crypto.randomUUID();
  switch (type) {
    case "introText":
      return {
        id,
        type,
        title: createLocalizedText("Intro", ""),
        body: createLocalizedText("", ""),
        timing: { waitForUser: true },
      };
    case "focusBoard":
      return {
        id,
        type,
        caption: createLocalizedText("", ""),
      };
    case "showMove":
      return {
        id,
        type,
        timing: { autoPlay: true, durationMs: 900 },
      };
    case "showLine":
      return {
        id,
        type,
        timing: { autoPlay: true, durationMs: 1200 },
      };
    case "askMove":
      return {
        id,
        type,
        body: createLocalizedText("Your turn.", ""),
        interaction: {
          kind: "askMove",
          allowRetry: false,
          maxAttempts: 1,
          successPolicy: "exactOne",
        },
      };
    case "askSequence":
      return {
        id,
        type,
        body: createLocalizedText("Play the sequence.", "Speel de volgorde."),
        interaction: {
          kind: "askSequence",
          requireExactOrder: true,
          allowRetry: true,
          maxAttempts: 1,
          expectedSequence: [
            { from: 31, to: 35 },
            { from: 35, to: 40 },
          ],
        },
      };
    case "askCount":
      return {
        id,
        type,
        body: createLocalizedText("How many legal moves for White?", "Hoeveel legale zetten voor wit?"),
        interaction: {
          kind: "askCount",
          correctValue: 3,
          allowRetry: true,
          maxAttempts: 3,
        },
      };
    case "askSelectSquares":
      return {
        id,
        type,
        body: createLocalizedText("Select the important squares.", "Selecteer de belangrijke velden."),
        interaction: {
          kind: "askSelectSquares",
          targetSquares: [32, 33, 34],
          requireExactSet: true,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    case "askSelectPieces":
      return {
        id,
        type,
        body: createLocalizedText("Select the pieces that can capture.", "Selecteer de stukken die kunnen slaan."),
        interaction: {
          kind: "askSelectPieces",
          targetSquares: [31, 42],
          requireExactSet: false,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    case "multipleChoice": {
      const correctId = crypto.randomUUID();
      const wrongId = crypto.randomUUID();
      return {
        id,
        type,
        body: createLocalizedText("", ""),
        interaction: {
          kind: "multipleChoice",
          prompt: createLocalizedText(
            "Choose the best answer.",
            "Kies het beste antwoord."
          ),
          options: [
            {
              id: correctId,
              label: createLocalizedText("Correct", "Correct"),
              isCorrect: true,
            },
            {
              id: wrongId,
              label: createLocalizedText("Wrong", "Fout"),
              isCorrect: false,
            },
          ],
          allowMultiple: false,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "placePieces":
      return {
        id,
        type,
        body: createLocalizedText(
          "Place the pieces as required.",
          "Zet de stukken zoals gevraagd."
        ),
        interaction: {
          kind: "placePieces",
          prompt: createLocalizedText("Build this position.", "Bouw deze stelling."),
          expectedPlacement: [
            { square: 31, piece: "wm" },
            { square: 36, piece: "bk" },
          ],
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    case "summary":
      return {
        id,
        type,
        body: createLocalizedText("", ""),
      };
    case "checkpoint":
      return {
        id,
        type,
        title: createLocalizedText("Checkpoint", ""),
        body: createLocalizedText("", ""),
      };
    default:
      return {
        id,
        type,
        body: createLocalizedText("", ""),
      };
  }
}
