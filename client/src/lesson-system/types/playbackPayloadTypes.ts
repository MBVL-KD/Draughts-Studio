import type { ArrowSpec, HighlightSpec, RouteSpec } from "./presentationTypes";
import type { MoveGlyph } from "./analysisTypes";

export type PlaybackEvent =
  | {
      type: "pre_comment";
      ply: number;
      text: string;
    }
  | {
      type: "post_comment";
      ply: number;
      text: string;
    }
  | {
      type: "glyphs";
      ply: number;
      glyphs: MoveGlyph[];
    }
  | {
      type: "overlay";
      ply: number;
      highlights: HighlightSpec[];
      arrows: ArrowSpec[];
      routes: RouteSpec[];
    };

export type PlaybackNode = {
  id: string;
  ply: number;
  notation?: string;
  fenAfter?: string;
  parentId?: string | null;
  childrenIds: string[];
};

/** Structured move for Roblox/runtime — compare path + captures, not notation alone. */
export type RuntimeStructuredMovePayload = {
  notation: string;
  from: number;
  to: number;
  path: number[];
  captures: number[];
  resultFen: string;
};

export type RuntimeValidationPayload =
  | {
      runtimeKind: "line";
      acceptMode: "exact";
      acceptedLines: Array<{ moves: RuntimeStructuredMovePayload[] }>;
      moveSource: "notation_engine" | "timeline_engine" | "mixed";
    }
  | { runtimeKind: "none"; acceptMode: "exact" }
  | {
      runtimeKind: "goal";
      acceptMode: "exact";
      goalType: string;
      targetSquare?: number;
      sideToTest?: "white" | "black";
    }
  | {
      runtimeKind: "authoring_only";
      acceptMode: "exact";
      authoring: Record<string, unknown> & {
        _resolveError?: string;
        _resolveDebug?: {
          initialFen: string;
          authoringMoves: string[];
          failedAtMoveIndex: number | null;
          fenBeforeFailedMove?: string;
          failedNotation?: string;
        };
      };
    };

/** Lesson position in book order (GET `/api/steps/:id/playback`). */
export type PlaybackNavigationPayload = {
  bookId: string;
  lessonId: string;
  stepId: string;
  /** 0-based index in the lesson `steps` array. */
  stepIndex: number;
  totalSteps: number;
  previousStepId: string | null;
  nextStepId: string | null;
};

/** Hint line for runtime UI (text + optional first expected move squares). */
export type PlaybackHintPayload = {
  text?: string;
  expectedFrom?: number;
  expectedTo?: number;
};

export type PuzzleScanPlaybackPayload = {
  scanFallbackEnabled: boolean;
  strictAuthoredOnly: boolean;
  puzzleSide: "white" | "black";
  baseline: {
    evaluationCp: number | null;
    band: "winning" | "large_advantage" | "unclear" | "equal" | "losing";
    source: "stored" | "missing";
  };
  policy: {
    evalTolerance: number;
    winningThreshold: number;
    equalBandMax: number;
    scanDepth: number;
    multiPv: number;
  };
  debug: string[];
};

export type LessonStepPlaybackPayload = {
  /** Legacy client label; API uses payloadType + payloadVersion. */
  schemaVersion: "lesson-step-playback.v1" | "lesson-step-playback.v2";
  stepId: string;
  stepType: string;
  title: string;
  prompt: string;
  initialFen: string;
  sideToMove: "white" | "black";
  variantId?: string;
  lineMode: "mainline" | "variation" | "custom";
  sourceId?: string;
  startNodeId?: string | null;
  endNodeId?: string | null;
  nodes: PlaybackNode[];
  autoplayMoves: string[];
  events: PlaybackEvent[];
  validation?: RuntimeValidationPayload;
  puzzleScan?: PuzzleScanPlaybackPayload;
  navigation?: PlaybackNavigationPayload;
  hint?: PlaybackHintPayload;
};

