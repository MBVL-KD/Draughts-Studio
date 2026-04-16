export type SideToMove = "white" | "black";
export type PieceCode = "wm" | "wk" | "bm" | "bk" | "empty";
export type EditorMode = "paint" | "highlight" | "arrow" | "route" | "validation" | "record";

export type HighlightColor = "primary" | "success" | "warning" | "danger" | "info";
export type ArrowColor = HighlightColor;
export type RouteColor = HighlightColor;

export type HighlightSpec = {
  id: string;
  squares: number[];
  color: HighlightColor;
  pulse?: boolean;
  fill?: boolean;
  outline?: boolean;
  /**
   * square = cell tint (default). ring = circular rim around the square centre (piece highlight).
   */
  overlayShape?: "square" | "ring";
};

export type ArrowSpec = {
  id: string;
  from: number | null;
  to: number | null;
  color: ArrowColor;
  curved?: boolean;
  dashed?: boolean;
  label?: string;
};

export type RouteSpec = {
  id: string;
  squares: number[];
  color: RouteColor;
  closed?: boolean;
  dashed?: boolean;
  label?: string;
};

export type PresentationState = {
  highlights: HighlightSpec[];
  arrows: ArrowSpec[];
  routes: RouteSpec[];
};

export type BoardPositionState = {
  piecesBySquare: Record<number, PieceCode>;
  sideToMove: SideToMove;
};

/** Timeline / board-scene animation cue (editor; optional in persisted payloads). */
export type AnimationCueAction =
  | "showArrow"
  | "hideArrow"
  | "showHighlight"
  | "hideHighlight"
  | "playMove";

export type AnimationCue = {
  id: string;
  atMs: number;
  action: AnimationCueAction;
  targetId: string;
};
