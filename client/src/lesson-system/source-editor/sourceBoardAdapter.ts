import type { AnalysisMove } from "../types/analysisTypes";
import type { SourceBoardMoveEvent } from "./sourceBoardTypes";

export type SetupBrush =
  | "empty"
  | "wm"
  | "wk"
  | "bm"
  | "bk";

export type BoardSquareClickEvent = {
  square: number;
};

export type BoardMoveSubmitEvent = {
  notation: string;
  from?: number;
  to?: number;
  path?: number[];
  captures?: number[];
  side: "W" | "B";
  fenAfter: string;
};

export function buildAnalysisMoveFromBoardEvent(
  event: BoardMoveSubmitEvent
): AnalysisMove {
  return {
    notation: event.notation,
    side: event.side,
    from: event.from,
    to: event.to,
    path: event.path,
    captures: event.captures,
  };
}

export function buildMoveResultFromBoardEvent(
  event: BoardMoveSubmitEvent
): SourceBoardMoveEvent {
  return {
    move: buildAnalysisMoveFromBoardEvent(event),
    fenAfter: event.fenAfter,
  };
}