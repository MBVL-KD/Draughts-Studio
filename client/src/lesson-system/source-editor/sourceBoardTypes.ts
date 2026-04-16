import type { AnalysisMove } from "../types/analysisTypes";

export type SourceBoardMoveEvent = {
  move: AnalysisMove;
  fenAfter: string;
};

export type SourceBoardPosition = {
  fen: string;
  selectedNodeId: string | null;
};

export type SourceBoardMode = "play" | "setup";