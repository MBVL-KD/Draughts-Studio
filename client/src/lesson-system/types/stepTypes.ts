// client/src/lesson-system/types/stepTypes.ts

import type { ArrowSpec, HighlightSpec, RouteSpec } from "./presentationTypes";
import type {
  CountValidation,
  GoalValidation,
  MarkPathValidation,
  MultipleChoiceValidation,
  NoneValidation,
  MoveValidation,
  PlacePiecesValidation,
  SelectPiecesValidation,
  SelectSquaresValidation,
  SequenceValidation,
  ZonePaintValidation,
} from "./validationTypes";
import type { LocalizedText } from "./i18nTypes";
import type { StepSourceRef } from "./stepSourceTypes";
import type { StepFlow } from "./stepFlowTypes";

/** Optional per-step translation overrides (structure varies by editor version). */
export type StepI18nBundle = Record<string, unknown>;

export type LessonStepType =
  | "explain"
  | "demo"
  | "move"
  | "sequence"
  | "count"
  | "select_squares"
  | "select_pieces"
  | "multiple_choice"
  | "place_pieces"
  | "mark_path"
  | "zone_paint"
  | "goal_challenge";

export type StepValidation =
  | NoneValidation
  | MoveValidation
  | SequenceValidation
  | CountValidation
  | SelectSquaresValidation
  | SelectPiecesValidation
  | MultipleChoiceValidation
  | PlacePiecesValidation
  | MarkPathValidation
  | ZonePaintValidation
  | GoalValidation;

export type StepPresentation = {
  highlights?: HighlightSpec[];
  arrows?: ArrowSpec[];
  routes?: RouteSpec[];
  animations?: unknown[];
  npc?: {
    npcId?: string;
    text?: LocalizedText;
    mode?: string;
  };
  autoplay?: {
    moves?: string[];
    moveDurationMs?: number;
    startDelayMs?: number;
    autoPlayOnStepOpen?: boolean;
  };
};

export type StepFeedback = {
  correct: LocalizedText;
  incorrect: LocalizedText;
};

export type LessonStep = {
  id: string;
  stepId?: string;
  type: LessonStepType;

  title: LocalizedText;
  prompt: LocalizedText;
  hint: LocalizedText;
  explanation: LocalizedText;

  initialState: {
    fen: string;
    sideToMove: "white" | "black";
  };

  sourceRef?: StepSourceRef;
  flow?: StepFlow;

  presentation: StepPresentation;
  validation: StepValidation;
  feedback: StepFeedback;

  analytics?: {
    tags?: string[];
  };

  examBehavior?: {
    disableHints?: boolean;
    maxAttempts?: number;
  };

  orderIndex?: number;
  tags?: string[];
  runtimeHints?: Record<string, string | number | boolean | null>;
  puzzleMeta?: {
    puzzleRating: number;
    difficultyBand: "beginner" | "intermediate" | "advanced";
    topicTags: string[];
    ratingSource: "collection-default" | "scan-heuristic" | "manual";
  };

  i18n?: StepI18nBundle;
};