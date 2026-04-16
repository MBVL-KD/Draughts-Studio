// client/src/lesson-system/registry/stepTypeRegistry.ts

import type { LessonStepType } from "../types/stepTypes";
import type { LocalizedText } from "../types/i18nTypes";
import { createLocalizedText } from "../utils/i18nHelpers";

export type StepTypeConfig = {
  label: LocalizedText;
  description: LocalizedText;
};

export const STEP_TYPE_REGISTRY: Record<LessonStepType, StepTypeConfig> = {
  explain: {
    label: createLocalizedText("Explain", "Uitleg"),
    description: createLocalizedText(
      "Explain step with text and/or NPC",
      "Uitleg stap met tekst en/of NPC"
    ),
  },

  demo: {
    label: createLocalizedText("Demo", "Demo"),
    description: createLocalizedText(
      "Automatic animation",
      "Automatische animatie"
    ),
  },

  move: {
    label: createLocalizedText("Move", "Zet"),
    description: createLocalizedText(
      "Player makes a move",
      "Speler doet een zet"
    ),
  },

  sequence: {
    label: createLocalizedText("Sequence", "Reeks"),
    description: createLocalizedText(
      "Multiple moves",
      "Meerdere zetten"
    ),
  },

  count: {
    label: createLocalizedText("Count", "Tellen"),
    description: createLocalizedText(
      "Count something",
      "Aantal berekenen"
    ),
  },

  select_squares: {
    label: createLocalizedText("Select Squares", "Velden selecteren"),
    description: createLocalizedText(
      "Click squares",
      "Klik velden"
    ),
  },

  select_pieces: {
    label: createLocalizedText("Select Pieces", "Stukken selecteren"),
    description: createLocalizedText(
      "Click pieces",
      "Klik stukken"
    ),
  },

  multiple_choice: {
    label: createLocalizedText("Multiple Choice", "Meerkeuze"),
    description: createLocalizedText(
      "Choose the correct answer",
      "Meerkeuze vraag"
    ),
  },

  place_pieces: {
    label: createLocalizedText("Place Pieces", "Stukken plaatsen"),
    description: createLocalizedText(
      "Place pieces on the board",
      "Stukken plaatsen"
    ),
  },

  mark_path: {
    label: createLocalizedText("Mark Path", "Route"),
    description: createLocalizedText(
      "Draw a path",
      "Route tekenen"
    ),
  },

  zone_paint: {
    label: createLocalizedText("Zone Paint", "Zone"),
    description: createLocalizedText(
      "Mark an area",
      "Velden markeren"
    ),
  },

  goal_challenge: {
    label: createLocalizedText("Goal Challenge", "Doel"),
    description: createLocalizedText(
      "Reach a goal",
      "Vrij doel bereiken"
    ),
  },
};