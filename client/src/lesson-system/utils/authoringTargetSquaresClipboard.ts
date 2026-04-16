import { sortUniqueSquares } from "./selectionSquareSetHelpers";

export type AuthoringTargetSquaresClip = number[];

export function normalizeClip(squares: number[]): AuthoringTargetSquaresClip {
  return sortUniqueSquares(squares);
}
