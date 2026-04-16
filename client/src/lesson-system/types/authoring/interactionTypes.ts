import type { Id, LocalizedText } from "./coreTypes";

/**
 * MVP interaction + feedback shapes.
 *
 * MVP (implement soon): expected moves, allowRetry, maxAttempts, wrong/illegal messages,
 *   forbidBackwardMove?, requireCapture?
 * Later: longest capture, exact path, side filters, lesson rule overrides, branching policies.
 */

export type ExpectedMoveSpec = {
  from: number;
  to: number;
  path?: number[];
  captures?: number[];
  label?: LocalizedText;
};

export type AskMoveInteraction = {
  kind: "askMove";
  prompt?: LocalizedText;
  allowDrag?: boolean;
  allowTap?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  expectedMoves?: ExpectedMoveSpec[];
  /** MVP: single message when move is wrong (not illegal). */
  wrongMessage?: LocalizedText;
  successPolicy?: "anyExpected" | "exactOne";
  /** Preview: highlight these squares after wrong/illegal (Bundel 6a). */
  wrongHintHighlightSquares?: number[];
  /** Preview: extra caption line after success. */
  successCoachCaption?: LocalizedText;
  /** Preview: extra caption line after wrong/illegal. */
  wrongCoachCaption?: LocalizedText;
};

/** Bundel 9a: play multiple moves in order (or unordered pool when `requireExactOrder` is false). */
export type AskSequenceInteraction = {
  kind: "askSequence";
  prompt?: LocalizedText;
  expectedSequence: ExpectedMoveSpec[];
  /** When true (default), plies must match `expectedSequence` in order. */
  requireExactOrder?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  wrongHintHighlightSquares?: number[];
  /** Ordered visual hint plan; later entries can reveal more concrete hints. */
  hintPlan?: Array<{
    type: "from" | "to" | "from_to" | "path" | "captures" | "last_capture_leg";
    /** Reveal this hint from Nth failed attempt (1-based). Defaults to list position. */
    afterFailedAttempts?: number;
  }>;
  /** Optional short hint (e.g. after wrong/illegal in preview). */
  sequenceHintMessage?: LocalizedText;
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

/** Bundel 12a: numeric count question; author supplies correct answer(s). */
export type AskCountInteraction = {
  kind: "askCount";
  prompt?: LocalizedText;
  correctValue: number;
  acceptedValues?: number[];
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

/** Bundel 12a: learner selects squares on the board (set compare). */
export type AskSelectSquaresInteraction = {
  kind: "askSelectSquares";
  prompt?: LocalizedText;
  targetSquares: number[];
  /** When true (default), selection must match target set exactly; otherwise all targets must be included (extras allowed). */
  requireExactSet?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  hintSquares?: number[];
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

/** Bundel 12a: same mechanics as squares; semantic hint for piece-oriented lessons. */
export type AskSelectPiecesInteraction = {
  kind: "askSelectPieces";
  prompt?: LocalizedText;
  targetSquares: number[];
  requireExactSet?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  hintSquares?: number[];
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

/** Bundel 13a: text-only multiple choice (single or multi select). */
export type MultipleChoiceOption = {
  id: string;
  label: LocalizedText;
  isCorrect: boolean;
  /** Bundel 13b: optional short rationale (stored for future feedback; preview shows dev-light). */
  explanation?: LocalizedText;
};

export type MultipleChoiceInteraction = {
  kind: "multipleChoice";
  prompt?: LocalizedText;
  options: MultipleChoiceOption[];
  allowMultiple?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  hintMessage?: LocalizedText;
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

export type PlacePiecesPieceCode = "wm" | "wk" | "bm" | "bk";

export type PlacePiecesExpectedSlot = {
  square: number;
  piece: PlacePiecesPieceCode;
};

/** Bundel 14a: learner builds an exact target position on an empty preview board. */
export type PlacePiecesInteraction = {
  kind: "placePieces";
  prompt?: LocalizedText;
  expectedPlacement: PlacePiecesExpectedSlot[];
  /** Optional full target board for authoring convenience (derived slots remain canonical for checks). */
  targetFen?: string;
  /** Optional move line from start -> target, for coaching/replay hints. */
  solutionSequence?: ExpectedMoveSpec[];
  /** When true, preview starts from empty board instead of start FEN. */
  previewStartsEmpty?: boolean;
  allowRetry?: boolean;
  maxAttempts?: number;
  wrongMessage?: LocalizedText;
  hintMessage?: LocalizedText;
  successCoachCaption?: LocalizedText;
  wrongCoachCaption?: LocalizedText;
};

export type InteractionSpec =
  | AskMoveInteraction
  | AskSequenceInteraction
  | AskCountInteraction
  | AskSelectSquaresInteraction
  | AskSelectPiecesInteraction
  | MultipleChoiceInteraction
  | PlacePiecesInteraction;

export type IllegalResponse = {
  id?: Id;
  /** MVP: one generic illegal message; reason enum expands later. */
  message: LocalizedText;
};

export type StrategicResponse = {
  id?: Id;
  moveMatch: ExpectedMoveSpec | ExpectedMoveSpec[];
  message?: LocalizedText;
};

export type MoveConstraintSet = {
  /** Later: longest capture, exact path, majority, piece kinds, variant overrides. */
  forbidBackwardMove?: boolean;
  requireCapture?: boolean;
  allowedFromSquares?: number[];
  allowedToSquares?: number[];
};
