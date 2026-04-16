import type { Id, LocalizedText, Side, TimestampString } from "./coreTypes";
import type { StepMoment } from "./timelineTypes";

/**
 * Canonical v2 lesson step (timeline-first).
 * Coexists with legacy `LessonStep` in `stepTypes.ts` until the studio UI switches over.
 *
 * Existing product features (Scan, notation animation, board editor, etc.) stay in their modules;
 * this type is the target shape those systems will feed or read from.
 */

export type AuthoringSourceRef = {
  sourceId: Id;
  nodeId?: Id;
  lineId?: Id;
  plyRange?: [number, number];
  note?: string;
};

export type AuthoringStepKind =
  | "explain"
  | "demo"
  | "tryMove"
  | "trySequence"
  | "checkpoint"
  | "summary"
  | "ruleBoundary"
  | "freeform";

export type AuthoringStepInitialState = {
  fen?: string;
  sideToMove?: Side;
  variantId?: string;
  rulesetId?: string;
  orientation?: "whiteBottom" | "blackBottom" | "auto";
  boardThemeId?: string;
  pieceThemeId?: string;
};

export type AuthoringStepSceneConfig = {
  environmentThemeId?: string;
  musicCueId?: string;
  ambienceCueId?: string;
  uiPresetId?: string;
};

export type AuthoringLessonStep = {
  id: Id;
  lessonId: Id;

  kind: AuthoringStepKind;
  orderIndex: number;

  title?: LocalizedText;
  shortTitle?: LocalizedText;
  goal?: LocalizedText;
  summary?: LocalizedText;

  initialState: AuthoringStepInitialState;
  scene?: AuthoringStepSceneConfig;

  /** Core teaching timeline. */
  timeline: StepMoment[];

  sourceRef?: AuthoringSourceRef;
  tags?: string[];

  /** Slagzet / scan grading; mirrored onto legacy stubs for analytics. */
  puzzleMeta?: {
    puzzleRating: number;
    difficultyBand: "beginner" | "intermediate" | "advanced";
    topicTags: string[];
    ratingSource: "collection-default" | "scan-heuristic" | "manual";
  };

  /** Optional import / engine hints (legacy parity). */
  runtimeHints?: Record<string, string | number | boolean | null>;

  editorMeta?: {
    collapsed?: boolean;
    colorTag?: string;
    notes?: string;
  };

  metadata?: {
    version?: number;
    createdAt?: TimestampString;
    updatedAt?: TimestampString;
    /** Traceability for Slagzet → authoring imports. */
    slagzetImport?: {
      importedAt?: string;
      snapshotFen?: string;
    };
  };
};
