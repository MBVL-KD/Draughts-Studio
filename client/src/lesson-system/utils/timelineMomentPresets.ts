import type { StepMoment } from "../types/authoring/timelineTypes";
import { createLocalizedText } from "./i18nHelpers";
import { createMoment } from "./timelineMomentFactories";

/**
 * Bundel 10b: named authoring starters (full moments, new ids each call).
 * No runtime changes — same shapes the editor already supports.
 */
export const AUTHORING_MOMENT_PRESET_IDS = [
  "askMoveBasic",
  "askMoveWithHint",
  "askSequenceBasic",
  "askCountBasic",
  "askSelectSquaresBasic",
  "askSelectSquaresWithHint",
  "askSelectPiecesBasic",
  "multipleChoiceBasic",
  "multipleChoiceRuleCheck",
  "multipleChoiceMultiAnswer",
  "placePiecesBasic",
  "placePiecesEndgameSetup",
  "placePiecesPromotionSetup",
  "ruleWarning",
  "showMoveWithArrow",
  "showLineDemo",
  "branchIntro",
  "summaryRecap",
] as const;

export type AuthoringMomentPresetId = (typeof AUTHORING_MOMENT_PRESET_IDS)[number];

export type AuthoringMomentPresetMeta = {
  id: AuthoringMomentPresetId;
  labelEn: string;
  labelNl: string;
};

export function listAuthoringMomentPresets(): readonly AuthoringMomentPresetMeta[] {
  return [
    { id: "askMoveBasic", labelEn: "askMove · basic", labelNl: "askMove · basis" },
    { id: "askMoveWithHint", labelEn: "askMove · hint", labelNl: "askMove · hint" },
    { id: "askSequenceBasic", labelEn: "askSequence · basic", labelNl: "askSequence · basis" },
    { id: "askCountBasic", labelEn: "askCount · basic", labelNl: "askCount · basis" },
    { id: "askSelectSquaresBasic", labelEn: "askSelectSquares · basic", labelNl: "askSelectSquares · basis" },
    {
      id: "askSelectSquaresWithHint",
      labelEn: "askSelectSquares · hint coach",
      labelNl: "askSelectSquares · coach-hint",
    },
    { id: "askSelectPiecesBasic", labelEn: "askSelectPieces · basic", labelNl: "askSelectPieces · basis" },
    {
      id: "multipleChoiceBasic",
      labelEn: "multipleChoice · basic (2 opts)",
      labelNl: "multipleChoice · basis (2 opties)",
    },
    {
      id: "multipleChoiceRuleCheck",
      labelEn: "multipleChoice · rule check (3 + hint)",
      labelNl: "multipleChoice · regelcheck (3 + hint)",
    },
    {
      id: "multipleChoiceMultiAnswer",
      labelEn: "multipleChoice · multi answer (4, 2 correct)",
      labelNl: "multipleChoice · meerdere goed (4, 2 juist)",
    },
    {
      id: "placePiecesBasic",
      labelEn: "placePieces · basic (2 pieces)",
      labelNl: "placePieces · basis (2 stukken)",
    },
    {
      id: "placePiecesEndgameSetup",
      labelEn: "placePieces · endgame sample",
      labelNl: "placePieces · eindspel-voorbeeld",
    },
    {
      id: "placePiecesPromotionSetup",
      labelEn: "placePieces · promotion sample",
      labelNl: "placePieces · promotie-voorbeeld",
    },
    { id: "ruleWarning", labelEn: "Rule warning", labelNl: "Regel-waarschuwing" },
    { id: "showMoveWithArrow", labelEn: "showMove · arrow", labelNl: "showMove · pijl" },
    { id: "showLineDemo", labelEn: "showLine · demo", labelNl: "showLine · demo" },
    { id: "branchIntro", labelEn: "Branch intro", labelNl: "Zijlijn-intro" },
    { id: "summaryRecap", labelEn: "Summary · recap", labelNl: "Samenvatting" },
  ];
}

function newId(): string {
  return crypto.randomUUID();
}

export function createMomentFromPreset(presetId: AuthoringMomentPresetId): StepMoment {
  switch (presetId) {
    case "askMoveBasic": {
      const base = createMoment("askMove");
      if (base.interaction?.kind !== "askMove") return base;
      return {
        ...base,
        body: createLocalizedText("Your turn — play the intended move.", "Jij bent aan zet."),
        interaction: {
          ...base.interaction,
          expectedMoves: [{ from: 31, to: 35 }],
          maxAttempts: 5,
        },
      };
    }
    case "askMoveWithHint": {
      const base = createMoment("askMove");
      if (base.interaction?.kind !== "askMove") return base;
      return {
        ...base,
        body: createLocalizedText(
          "Find the best move — a hint appears after a wrong try.",
          "Zoek de beste zet — na een fout verschijnt een hint."
        ),
        interaction: {
          ...base.interaction,
          expectedMoves: [{ from: 31, to: 35 }],
          maxAttempts: 5,
          wrongMessage: createLocalizedText(
            "Not the move we are looking for.",
            "Niet de zet die we zoeken."
          ),
          wrongHintHighlightSquares: [31, 35, 40],
          wrongCoachCaption: createLocalizedText(
            "Try the highlighted squares.",
            "Probeer de gemarkeerde velden."
          ),
        },
      };
    }
    case "askSequenceBasic":
      return createMoment("askSequence");
    case "askCountBasic": {
      const base = createMoment("askCount");
      if (base.interaction?.kind !== "askCount") return base;
      return {
        ...base,
        interaction: {
          ...base.interaction,
          prompt: createLocalizedText("How many are there?", "Hoeveel zijn er?"),
          correctValue: 1,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "askSelectSquaresBasic": {
      const base = createMoment("askSelectSquares");
      if (base.interaction?.kind !== "askSelectSquares") return base;
      return {
        ...base,
        interaction: {
          ...base.interaction,
          prompt: createLocalizedText(
            "Select the correct squares",
            "Selecteer de juiste velden"
          ),
          targetSquares: [],
          requireExactSet: true,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "askSelectSquaresWithHint": {
      const base = createMoment("askSelectSquares");
      if (base.interaction?.kind !== "askSelectSquares") return base;
      return {
        ...base,
        interaction: {
          ...base.interaction,
          targetSquares: [],
          hintSquares: [],
          requireExactSet: true,
          allowRetry: true,
          maxAttempts: 5,
          wrongCoachCaption: createLocalizedText(
            "Use the hints on the board after a wrong try.",
            "Gebruik na een fout de hints op het bord."
          ),
        },
      };
    }
    case "askSelectPiecesBasic": {
      const base = createMoment("askSelectPieces");
      if (base.interaction?.kind !== "askSelectPieces") return base;
      return {
        ...base,
        interaction: {
          ...base.interaction,
          prompt: createLocalizedText(
            "Select the correct pieces",
            "Selecteer de juiste stukken"
          ),
          targetSquares: [],
          requireExactSet: true,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "multipleChoiceBasic": {
      const base = createMoment("multipleChoice");
      if (base.type !== "multipleChoice" || base.interaction?.kind !== "multipleChoice") return base;
      return {
        ...base,
        body: createLocalizedText("", ""),
        interaction: {
          ...base.interaction,
          prompt: createLocalizedText(
            "Choose the best answer.",
            "Kies het beste antwoord."
          ),
          allowMultiple: false,
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "multipleChoiceRuleCheck": {
      const base = createMoment("multipleChoice");
      if (base.type !== "multipleChoice" || base.interaction?.kind !== "multipleChoice") return base;
      const a = newId();
      const b = newId();
      const c = newId();
      return {
        ...base,
        body: createLocalizedText("", ""),
        interaction: {
          kind: "multipleChoice",
          prompt: createLocalizedText(
            "Which statement is correct?",
            "Welke uitspraak klopt?"
          ),
          hintMessage: createLocalizedText(
            "Only one statement matches the rule as taught in this lesson.",
            "Slechts één uitspraak past bij de regel zoals in deze les uitgelegd."
          ),
          allowMultiple: false,
          allowRetry: true,
          maxAttempts: 5,
          options: [
            {
              id: a,
              label: createLocalizedText(
                "Captures are never mandatory in draughts.",
                "Slaan is bij dammen nooit verplicht."
              ),
              isCorrect: false,
            },
            {
              id: b,
              label: createLocalizedText(
                "When a capture is available, you must capture.",
                "Als er een slag mogelijk is, moet je slaan."
              ),
              isCorrect: true,
              explanation: createLocalizedText(
                "Matches the forced-capture rule used in most variants.",
                "Past bij de slagplicht die in de meeste varianten geldt."
              ),
            },
            {
              id: c,
              label: createLocalizedText(
                "You may move backwards with any piece.",
                "Je mag met elk stuk achteruit zetten."
              ),
              isCorrect: false,
            },
          ],
        },
      };
    }
    case "multipleChoiceMultiAnswer": {
      const base = createMoment("multipleChoice");
      if (base.type !== "multipleChoice" || base.interaction?.kind !== "multipleChoice") return base;
      const o1 = newId();
      const o2 = newId();
      const o3 = newId();
      const o4 = newId();
      return {
        ...base,
        body: createLocalizedText("", ""),
        interaction: {
          kind: "multipleChoice",
          prompt: createLocalizedText(
            "Select all that apply.",
            "Kies alles wat klopt."
          ),
          allowMultiple: true,
          allowRetry: true,
          maxAttempts: 5,
          options: [
            {
              id: o1,
              label: createLocalizedText("A king can capture forwards.", "Een dam mag vooruit slaan."),
              isCorrect: true,
            },
            {
              id: o2,
              label: createLocalizedText("A king can capture backwards.", "Een dam mag achteruit slaan."),
              isCorrect: true,
            },
            {
              id: o3,
              label: createLocalizedText("A man may always move two squares.", "Een schijf mag altijd twee velden."),
              isCorrect: false,
            },
            {
              id: o4,
              label: createLocalizedText(
                "A man may jump over its own pieces.",
                "Een schijf mag over eigen stukken springen."
              ),
              isCorrect: false,
            },
          ],
        },
      };
    }
    case "placePiecesBasic": {
      const base = createMoment("placePieces");
      if (base.type !== "placePieces" || base.interaction?.kind !== "placePieces") return base;
      return {
        ...base,
        body: createLocalizedText(
          "Place the pieces exactly as configured.",
          "Zet de stukken exact zoals ingesteld."
        ),
        interaction: {
          ...base.interaction,
          prompt: createLocalizedText(
            "Build this small position.",
            "Bouw deze kleine stelling."
          ),
          expectedPlacement: [
            { square: 31, piece: "wm" },
            { square: 36, piece: "bk" },
          ],
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "placePiecesEndgameSetup": {
      const id = newId();
      return {
        id,
        type: "placePieces",
        body: createLocalizedText(
          "Recreate this endgame-style layout.",
          "Zet deze eindspelachtige opstelling na."
        ),
        interaction: {
          kind: "placePieces",
          prompt: createLocalizedText(
            "Set up the pieces for this endgame drill.",
            "Zet de stukken klaar voor deze eindspeloefening."
          ),
          expectedPlacement: [
            { square: 45, piece: "wk" },
            { square: 5, piece: "bm" },
            { square: 7, piece: "bm" },
            { square: 12, piece: "bk" },
          ],
          allowRetry: true,
          maxAttempts: 5,
          hintMessage: createLocalizedText(
            "Kings and a few pawns — check square numbers in the list if unsure.",
            "Dames en enkele schijven — controleer zo nodig de veldnummers in de lijst."
          ),
        },
      };
    }
    case "placePiecesPromotionSetup": {
      const id = newId();
      return {
        id,
        type: "placePieces",
        body: createLocalizedText(
          "Practice a promotion-related layout.",
          "Oefen een opstelling rond promotie."
        ),
        interaction: {
          kind: "placePieces",
          prompt: createLocalizedText(
            "Place white one step from promotion; black king covers.",
            "Zet wit één veld voor promotie; de zwarte dam dekt af."
          ),
          expectedPlacement: [
            { square: 46, piece: "wm" },
            { square: 41, piece: "bk" },
          ],
          allowRetry: true,
          maxAttempts: 5,
        },
      };
    }
    case "ruleWarning": {
      const id = newId();
      return {
        id,
        type: "introText",
        title: createLocalizedText("Rule reminder", "Regel-herinnering"),
        body: createLocalizedText(
          "Captures are mandatory when a capture is available. Wrong paths may be illegal in this lesson.",
          "Slaan is verplicht als er een slag mogelijk is. Verkeerde varianten kunnen in deze les illegaal zijn."
        ),
        timing: { waitForUser: true },
        ui: [
          {
            type: "showBanner",
            text: createLocalizedText("Lesson rules apply", "Lesregels gelden"),
            style: "warning",
          },
        ],
      };
    }
    case "showMoveWithArrow": {
      const id = newId();
      return {
        id,
        type: "showMove",
        caption: createLocalizedText(
          "Example move on the board.",
          "Voorbeeldzet op het bord."
        ),
        moveRef: {
          type: "inline",
          from: 31,
          to: 35,
          side: "white",
        },
        timing: { autoPlay: true, durationMs: 900 },
        overlays: [
          {
            type: "arrow",
            id: newId(),
            from: 31,
            to: 35,
            style: "candidate",
            animated: true,
          },
        ],
      };
    }
    case "showLineDemo": {
      const id = newId();
      return {
        id,
        type: "showLine",
        body: createLocalizedText(
          "Watch how the line unfolds.",
          "Kijk hoe de variant zich ontvouwt."
        ),
        lineRef: {
          type: "inline",
          moves: [
            { type: "inline", from: 31, to: 35, side: "white" },
            { type: "inline", from: 20, to: 24, side: "black" },
          ],
        },
        timing: { autoPlay: true, durationMs: 1200 },
      };
    }
    case "branchIntro": {
      const id = newId();
      return {
        id,
        type: "introText",
        title: createLocalizedText("Side line", "Zijlijn"),
        body: createLocalizedText(
          "We explore a variation here. You will return to the main line afterwards.",
          "We bekijken hier een variant. Daarna ga je weer verder op de hoofdlijn."
        ),
        timing: { waitForUser: true },
      };
    }
    case "summaryRecap": {
      const id = newId();
      return {
        id,
        type: "summary",
        title: createLocalizedText("Recap", "Samenvatting"),
        body: createLocalizedText(
          "What did you learn in this step? (Edit this text.)",
          "Wat heb je in deze stap geleerd? (Pas deze tekst aan.)"
        ),
        timing: { waitForUser: true },
      };
    }
  }
}
