import type { MoveGlyph } from "../analysisTypes";
import type { RecorderMoveSemanticRole } from "./recorderAuthoringTypes";
import type { Id, LocalizedText, Side } from "./coreTypes";
import type { BranchAction } from "./branchTypes";
import type {
  CameraAction,
  CoachAction,
  FxAction,
  TimingSpec,
  UiAction,
} from "./presentationRuntimeTypes";
import type {
  IllegalResponse,
  InteractionSpec,
  MoveConstraintSet,
  StrategicResponse,
} from "./interactionTypes";

/**
 * MVP moment kinds (editor + minimal player first).
 * Extra literals are reserved for forward-compatible documents — avoid building UX for them first.
 */
export type StepMomentType =
  | "introText"
  | "focusBoard"
  | "showMove"
  | "showLine"
  | "askMove"
  | "askSequence"
  | "askCount"
  | "askSelectSquares"
  | "askSelectPieces"
  | "multipleChoice"
  | "placePieces"
  | "summary"
  | "checkpoint"
  | "showWrongIdea"
  | "enterBranch"
  | "playBranch"
  | "returnFromBranch";

export type OverlaySemanticStyle =
  | "focus"
  | "hint"
  | "good"
  | "danger"
  | "illegal"
  | "candidate"
  | "target"
  | "selected"
  | "promotion"
  | "neutral";

export type AuthoringHighlightOverlay = {
  type: "highlight";
  id?: Id;
  squares: number[];
  style: OverlaySemanticStyle;
  pulse?: boolean;
  durationMs?: number;
  label?: LocalizedText;
};

export type AuthoringArrowOverlay = {
  type: "arrow";
  id?: Id;
  from: number;
  to: number;
  style: OverlaySemanticStyle;
  animated?: boolean;
  dashed?: boolean;
  label?: LocalizedText;
  durationMs?: number;
};

export type AuthoringRouteOverlay = {
  type: "route";
  id?: Id;
  path: number[];
  style: OverlaySemanticStyle;
  showDots?: boolean;
  showNumbers?: boolean;
  animated?: boolean;
  durationMs?: number;
};

export type AuthoringLabelOverlay = {
  type: "label";
  id?: Id;
  square: number;
  text: LocalizedText;
  style?: OverlaySemanticStyle;
};

/** MVP overlay set (mask / zone / relation / glyph-overlay later). */
export type AuthoringOverlaySpec =
  | AuthoringHighlightOverlay
  | AuthoringArrowOverlay
  | AuthoringRouteOverlay
  | AuthoringLabelOverlay;

export type PositionReference =
  | { type: "fen"; fen: string }
  | { type: "lessonSnapshot"; snapshotId: Id }
  | { type: "sourceNode"; sourceId: Id; nodeId: Id };

export type MoveReference =
  | {
      type: "inline";
      from: number;
      to: number;
      path?: number[];
      captures?: number[];
      side?: Side;
    }
  | { type: "sourceMove"; sourceId: Id; nodeId: Id };

export type LineReference =
  | { type: "inline"; moves: MoveReference[] }
  | { type: "sourceLine"; sourceId: Id; startNodeId: Id; endNodeId?: Id };

/** Light glyph attachment (badges / pills); not a full overlay render type yet. */
export type GlyphMarkerSpec = {
  id?: Id;
  glyph: MoveGlyph;
  text?: LocalizedText;
  square?: number;
  moveRef?: MoveReference;
};

export type StepMoment = {
  id: Id;
  type: StepMomentType;

  title?: LocalizedText;
  body?: LocalizedText;
  caption?: LocalizedText;

  positionRef?: PositionReference;
  moveRef?: MoveReference;
  lineRef?: LineReference;

  overlays?: AuthoringOverlaySpec[];
  glyphMarkers?: GlyphMarkerSpec[];

  coach?: CoachAction[];
  camera?: CameraAction[];
  fx?: FxAction[];
  ui?: UiAction[];
  timing?: TimingSpec;

  interaction?: InteractionSpec;
  constraints?: MoveConstraintSet;
  illegalResponses?: IllegalResponse[];
  strategicResponses?: StrategicResponse[];

  branchAction?: BranchAction;

  /** Filled when the moment was produced from the step recorder (for future branches / responses). */
  recorderMeta?: {
    semanticRole?: RecorderMoveSemanticRole;
    sourceNotationIndex?: number;
    /** For `showLine` from recorder: aligns with `lineRef.moves` when `lineRef.type === "inline"`. */
    plySemanticRoles?: Array<RecorderMoveSemanticRole | undefined>;
  };

  editorMeta?: {
    folded?: boolean;
    lane?: "main" | "feedback" | "branch" | "coach" | "fx";
    colorTag?: string;
  };
};
