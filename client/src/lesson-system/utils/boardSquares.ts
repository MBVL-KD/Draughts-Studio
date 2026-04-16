import type { PieceCode } from "../types/presentationTypes";

export function playableSquares(): number[] {
  return Array.from({ length: 50 }, (_, i) => i + 1);
}

export function squareToRowCol(square: number) {
  const index = square - 1;
  const row = Math.floor(index / 5);
  const colOnDark = index % 5;
  const col = row % 2 === 0 ? colOnDark * 2 + 1 : colOnDark * 2;
  return { row, col };
}

export function rowColToSquare(row: number, col: number): number | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  if ((row + col) % 2 === 0) return null;
  const colOnDark = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  return row * 5 + colOnDark + 1;
}

export function createEmptyPieces(): Record<number, PieceCode> {
  const out: Record<number, PieceCode> = {};
  for (let i = 1; i <= 50; i += 1) out[i] = "empty";
  return out;
}

export function createInitialPieces(): Record<number, PieceCode> {
  const pieces = createEmptyPieces();
  for (let i = 1; i <= 20; i += 1) pieces[i] = "bm";
  for (let i = 31; i <= 50; i += 1) pieces[i] = "wm";
  return pieces;
}
