export type PieceCode = "empty" | "wm" | "wk" | "bm" | "bk";
export type SideToMove = "W" | "B";

export type BoardState = {
  sideToMove: SideToMove;
  squares: Record<number, PieceCode>;
};

export const createEmptyBoardState = (): BoardState => {
  const squares: Record<number, PieceCode> = {};
  for (let i = 1; i <= 50; i += 1) {
    squares[i] = "empty";
  }

  return {
    sideToMove: "W",
    squares,
  };
};