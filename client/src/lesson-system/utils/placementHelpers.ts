import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import { createEmptyBoardState } from "../../features/board/boardTypes";
import type { PlacePiecesExpectedSlot, PlacePiecesPieceCode } from "../types/authoring/interactionTypes";

const VALID: readonly PlacePiecesPieceCode[] = ["wm", "wk", "bm", "bk"];

function isPlacePieceCode(p: string): p is PlacePiecesPieceCode {
  return (VALID as readonly string[]).includes(p);
}

/**
 * Last occurrence per square wins; invalid squares/pieces skipped.
 */
export function normalizeExpectedPlacement(
  rows: ReadonlyArray<{ square: number; piece: string }>
): PlacePiecesExpectedSlot[] {
  const bySq = new Map<number, PlacePiecesExpectedSlot>();
  for (const row of rows) {
    const sq = Math.floor(Number(row.square));
    if (!Number.isFinite(sq) || sq < 1 || sq > 50) continue;
    if (!isPlacePieceCode(String(row.piece))) continue;
    bySq.set(sq, { square: sq, piece: row.piece as PlacePiecesPieceCode });
  }
  return sortPlacementBySquare([...bySq.values()]);
}

export function sortPlacementBySquare(rows: PlacePiecesExpectedSlot[]): PlacePiecesExpectedSlot[] {
  return [...rows].sort((a, b) => a.square - b.square);
}

/** Build a 50-square board from optional base, then overlay placement. */
export function expectedPlacementToBoard(
  placement: ReadonlyArray<PlacePiecesExpectedSlot>,
  base?: BoardState
): BoardState {
  const b = base
    ? ({
        ...base,
        squares: { ...base.squares },
      } as BoardState)
    : createEmptyBoardState();
  for (const { square, piece } of placement) {
    if (square >= 1 && square <= 50) {
      b.squares[square] = piece;
    }
  }
  return b;
}

export function boardStateToExpectedPlacement(board: BoardState): PlacePiecesExpectedSlot[] {
  const out: PlacePiecesExpectedSlot[] = [];
  for (let i = 1; i <= 50; i += 1) {
    const p = board.squares[i];
    if (p && p !== "empty") {
      if (isPlacePieceCode(p)) {
        out.push({ square: i, piece: p });
      }
    }
  }
  return sortPlacementBySquare(out);
}

/** Exact equality of occupied squares (1–50); ignores sideToMove. */
export function placementsBoardLayoutEqual(a: BoardState, b: BoardState): boolean {
  for (let i = 1; i <= 50; i += 1) {
    if (a.squares[i] !== b.squares[i]) return false;
  }
  return true;
}

export function placementsEqual(
  a: ReadonlyArray<PlacePiecesExpectedSlot>,
  b: ReadonlyArray<PlacePiecesExpectedSlot>
): boolean {
  const na = normalizeExpectedPlacement(a);
  const nb = normalizeExpectedPlacement(b);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i += 1) {
    const x = na[i]!;
    const y = nb[i]!;
    if (x.square !== y.square || x.piece !== y.piece) return false;
  }
  return true;
}

export function squaresWherePiecesDiffer(expected: BoardState, actual: BoardState): number[] {
  const s: number[] = [];
  for (let i = 1; i <= 50; i += 1) {
    if (expected.squares[i] !== actual.squares[i]) s.push(i);
  }
  return s;
}

export type BrushForPlacement = PieceCode;
