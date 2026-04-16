import type { LocalizedText } from "../types/i18nTypes";
import { createLocalizedText } from "../utils/i18nHelpers";

export type PresentationFieldConfig = {
  key: string;
  label: LocalizedText;
  description?: LocalizedText;
};

export type PresentationTemplateConfig = {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  fields: PresentationFieldConfig[];
};

export const PRESENTATION_REGISTRY: PresentationTemplateConfig[] = [
  {
    id: "basic_prompt",
    label: createLocalizedText("Basic Prompt", "Basis prompt"),
    description: createLocalizedText(
      "Shows only text and optionally an NPC message.",
      "Toont alleen tekst en optioneel NPC-bericht."
    ),
    fields: [
      {
        key: "npc",
        label: createLocalizedText("NPC", "NPC"),
      },
      {
        key: "highlights",
        label: createLocalizedText("Highlights", "Highlights"),
      },
    ],
  },
  {
    id: "guided_move",
    label: createLocalizedText("Guided Move", "Begeleide zet"),
    description: createLocalizedText(
      "Shows hints, arrows, and highlights for a move task.",
      "Toont hints, arrows en highlights voor een zetopdracht."
    ),
    fields: [
      {
        key: "arrows",
        label: createLocalizedText("Arrows", "Arrows"),
      },
      {
        key: "highlights",
        label: createLocalizedText("Highlights", "Highlights"),
      },
      {
        key: "npc",
        label: createLocalizedText("NPC", "NPC"),
      },
    ],
  },
  {
    id: "demo_timeline",
    label: createLocalizedText("Demo Timeline", "Demo tijdlijn"),
    description: createLocalizedText(
      "Autoplay of moves with timing and visual cues.",
      "Autoplay van zetten met timing en visuele cues."
    ),
    fields: [
      {
        key: "animations",
        label: createLocalizedText("Animations", "Animaties"),
      },
      {
        key: "arrows",
        label: createLocalizedText("Arrows", "Arrows"),
      },
      {
        key: "highlights",
        label: createLocalizedText("Highlights", "Highlights"),
      },
      {
        key: "routes",
        label: createLocalizedText("Routes", "Routes"),
      },
      {
        key: "npc",
        label: createLocalizedText("NPC", "NPC"),
      },
    ],
  },
];