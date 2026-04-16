export type SquarePoint = {
  leftPct: number;
  topPct: number;
};

export type SquareRect = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export function inferBoardSizeFromPlayableSquares(playableSquareCount: number): 8 | 10 {
  if (playableSquareCount <= 32) return 8;
  return 10;
}

export function getPlayableSquareCountFromBoard(board: {
  squares: Record<number, string> | Record<string, string>;
}): number {
  return Object.keys(board.squares).length;
}

export function getSquareRect(square: number, boardSize: 8 | 10): SquareRect {
  const { row, col } = diagonalSquareToRowCol(square, boardSize);
  const cellPct = 100 / boardSize;

  return {
    leftPct: col * cellPct,
    topPct: row * cellPct,
    widthPct: cellPct,
    heightPct: cellPct,
  };
}

export function getSquareCenter(square: number, boardSize: 8 | 10): SquarePoint {
  const rect = getSquareRect(square, boardSize);

  return {
    leftPct: rect.leftPct + rect.widthPct / 2,
    topPct: rect.topPct + rect.heightPct / 2,
  };
}

/**
 * Current editor overlay geometry assumes classic diagonal playable-square numbering:
 * - 8x8 => 32 playable squares
 * - 10x10 => 50 playable squares
 *
 * Later we can swap this through the shared variant/rules resolver for Turkish etc.
 */
export function diagonalSquareToRowCol(square: number, boardSize: 8 | 10) {
  const playablePerRow = boardSize / 2;
  const zero = square - 1;

  const row = Math.floor(zero / playablePerRow);
  const idxInRow = zero % playablePerRow;

  // Even row => playable dark squares at cols 1,3,5...
  // Odd row  => playable dark squares at cols 0,2,4...
  const col = row % 2 === 0 ? idxInRow * 2 + 1 : idxInRow * 2;

  return { row, col };
}

export function buildPolylinePoints(
  squares: number[],
  boardSize: 8 | 10
): string {
  return squares
    .map((sq) => {
      const p = getSquareCenter(sq, boardSize);
      return `${p.leftPct},${p.topPct}`;
    })
    .join(" ");
}