export type RuntimeStructuredMove = {
  notation: string;
  from: number;
  to: number;
  path: number[];
  captures: number[];
  resultFen: string;
};

export type RuntimeAcceptedLine = {
  moves: RuntimeStructuredMove[];
};

export type ScanEvalBand =
  | "winning"
  | "large_advantage"
  | "unclear"
  | "equal"
  | "losing";

export type RuntimeValidationLineBlock = {
  runtimeKind: "line";
  acceptMode: "exact";
  acceptedLines: RuntimeAcceptedLine[];
  /** How structured moves were produced */
  moveSource: "notation_engine" | "timeline_engine" | "mixed";
};

export type RuntimeValidationNoneBlock = {
  runtimeKind: "none";
  acceptMode: "exact";
};

export type RuntimeValidationGoalBlock = {
  runtimeKind: "goal";
  acceptMode: "exact";
  goalType: string;
  targetSquare?: number;
  sideToTest?: "white" | "black";
};

export type RuntimeValidationPassthroughBlock = {
  runtimeKind: "authoring_only";
  acceptMode: "exact";
  authoring: Record<string, unknown>;
};

export type RuntimeValidationBlock =
  | RuntimeValidationLineBlock
  | RuntimeValidationNoneBlock
  | RuntimeValidationGoalBlock
  | RuntimeValidationPassthroughBlock;

export type PuzzleBaselineSource = "stored" | "missing";

export type PuzzleScanPlaybackMeta = {
  scanFallbackEnabled: boolean;
  /** When true, runtime must not use Scan fallback (strict authored line only). */
  strictAuthoredOnly: boolean;
  /** Side the puzzle is played for (starter). */
  puzzleSide: "white" | "black";
  baseline: {
    evaluationCp: number | null;
    band: ScanEvalBand;
    source: PuzzleBaselineSource;
  };
  policy: {
    evalTolerance: number;
    winningThreshold: number;
    equalBandMax: number;
    scanDepth: number;
    multiPv: number;
  };
  /** Reasons for debugging (why fallback is on/off). */
  debug: string[];
};
