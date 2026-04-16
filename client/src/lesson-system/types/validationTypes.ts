// client/src/lesson-system/types/validationTypes.ts

import type { LocalizedText } from "./i18nTypes";

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

export type NoneValidation = {
  type: "none";
};

export type MoveValidation = {
  type: "move";
  mode: "exact" | "allowed_set";
  correctMoves: string[]; // e.g. ["12-16", "27x18"]
};

export type SequenceValidation = {
  type: "sequence";
  moves: string[];
  allowBranches?: boolean;
};

export type CountValidation = {
  type: "count";
  countType:
    | "legal_moves"
    | "captures"
    | "movable_pieces"
    | "controlled_squares";
  expected: number;
};

export type SelectSquaresValidation = {
  type: "select_squares";
  mode: "exact" | "contains_all";
  squares: number[];
};

export type SelectPiecesValidation = {
  type: "select_pieces";
  mode: "exact" | "contains_all";
  pieceSquares: number[];
};

export type MultipleChoiceValidation = {
  type: "multiple_choice";
  options: Array<{
    id: string;
    label: LocalizedText;
    isCorrect: boolean;
  }>;
  allowMultiple?: boolean;
};

export type PlacePiecesValidation = {
  type: "place_pieces";
  mode: "exact" | "goal";
  pieceBank: Array<{
    piece: "wm" | "wk" | "bm" | "bk";
    count: number;
  }>;
  exactFen?: string;
  goalType?:
    | "opponent_no_legal_moves"
    | "force_capture"
    | "create_promotion_threat"
    | "win_material";
  sideToTest?: "white" | "black";
};

export type MarkPathValidation = {
  type: "mark_path";
  mode: "exact_path" | "reaches_goal";
  path?: number[];
  goal?:
    | "promotion"
    | "capture_route"
    | "escape_route"
    | "target_square";
  targetSquare?: number;
};

export type ZonePaintValidation = {
  type: "zone_paint";
  mode: "exact" | "contains_all";
  squares: number[];
};

export type GoalValidation = {
  type: "goal";
  goalType:
    | "no_legal_moves"
    | "force_capture"
    | "promote_in_one"
    | "win_material"
    | "reach_square";
  targetSquare?: number;
  sideToTest?: "white" | "black";
};