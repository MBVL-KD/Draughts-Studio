import type { BoardState } from "../../features/board/boardTypes";
import {
  applyCompleteCaptureMove,
  applyEngineMove,
  applyPartialCaptureStep,
  cloneBoard,
  getAllCaptureSequencesForSquare,
  getContinuationCaptureTargets,
  getTargetsForSquare,
  type EngineMove,
  type EngineSide,
} from "../source-editor/sourceBoardEngine";

function parseNotationPath(notation: string): number[] | null {
  const cleaned = notation.trim();
  if (!cleaned) return null;
  const path = cleaned
    .split(/[-x]/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (path.length < 2) return null;
  return path;
}

function parseImportedCaptureSpec(notation: string): { from: number; to: number; captures: number[] } | null {
  const cleaned = notation.trim();
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[-x]/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 3) return null;
  const from = parts[0]!;
  const to = parts[1]!;
  const captures = parts.slice(2);
  if (!captures.length) return null;
  return { from, to, captures };
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function resolveImportedCaptureSpec(
  board: BoardState,
  spec: { from: number; to: number; captures: number[] },
  side: EngineSide
): EngineMove | null {
  const targets = getTargetsForSquare(board, spec.from).filter(
    (t) => !!t.isCapture && typeof t.captured === "number"
  );
  if (targets.length === 0) return null;

  const dfs = (
    workingBoard: BoardState,
    current: number,
    travelled: number[],
    captures: number[]
  ): { path: number[]; captures: number[] } | null => {
    if (captures.length === spec.captures.length) {
      if (current === spec.to && arraysEqual(captures, spec.captures)) {
        return { path: travelled, captures };
      }
      return null;
    }
    const cont = getContinuationCaptureTargets(workingBoard, current, travelled, captures).filter(
      (t) => !!t.isCapture && typeof t.captured === "number"
    );
    for (const t of cont) {
      const nextCaptured = t.captured as number;
      const nextCaptures = [...captures, nextCaptured];
      const expectedPrefix = spec.captures.slice(0, nextCaptures.length);
      if (!arraysEqual(nextCaptures, expectedPrefix)) continue;
      const nextBoard = applyPartialCaptureStep(workingBoard, current, t.to, nextCaptured);
      const hit = dfs(nextBoard, t.to, [...travelled, t.to], nextCaptures);
      if (hit) return hit;
    }
    return null;
  };

  for (const target of targets) {
    const firstCaptured = target.captured as number;
    if (spec.captures[0] !== firstCaptured) continue;
    const nextBoard = applyPartialCaptureStep(board, spec.from, target.to, firstCaptured);
    const hit = dfs(nextBoard, target.to, [spec.from, target.to], [firstCaptured]);
    if (!hit) continue;
    return applyCompleteCaptureMove(board, spec.from, hit.path, hit.captures, side);
  }
  return null;
}

/**
 * Resolves a single PD notation on `board` using the same legality rules as the Studio recorder.
 * Returns null if the move is not uniquely legal on this position (no fuzzy fallback).
 */
export function resolveNotationToEngineMove(
  board: BoardState,
  notation: string
): EngineMove | null {
  const path = parseNotationPath(notation);
  if (!path) return null;

  const from = path[0];
  if (typeof from !== "number") return null;
  const side = board.sideToMove as EngineSide;
  const travelled: number[] = [from];
  const captures: number[] = [];
  let current = from;
  let workingBoard = cloneBoard(board);

  for (let index = 1; index < path.length; index += 1) {
    const to = path[index];
    if (typeof to !== "number") return null;
    const targets =
      captures.length === 0
        ? getTargetsForSquare(workingBoard, current)
        : getContinuationCaptureTargets(workingBoard, current, travelled, captures);
    const target = targets.find((candidate) => candidate.to === to);
    if (!target) {
      // Compact capture notation like "36x17" can omit intermediate landing squares.
      // If the first segment can't be matched directly, resolve by unique full capture sequence.
      const isCompactCapture = notation.includes("x") && path.length === 2 && index === 1;
      if (isCompactCapture) {
        const finalTo = path[path.length - 1]!;
        const sequences = getAllCaptureSequencesForSquare(board, from).filter(
          (seq) => seq.path[seq.path.length - 1] === finalTo
        );
        if (sequences.length === 1) {
          const seq = sequences[0]!;
          return applyCompleteCaptureMove(board, from, [...seq.path], [...seq.captures], side);
        }
      }
      const imported = parseImportedCaptureSpec(notation);
      if (imported) {
        const direct = resolveImportedCaptureSpec(board, imported, side);
        if (direct) return direct;
        const rev = [...imported.captures].reverse();
        if (!arraysEqual(rev, imported.captures)) {
          const fallback = resolveImportedCaptureSpec(
            board,
            { ...imported, captures: rev },
            side
          );
          if (fallback) return fallback;
        }
      }
      return null;
    }

    travelled.push(to);
    const isLast = index === path.length - 1;
    const isCapture = !!target.isCapture && typeof target.captured === "number";

    if (isCapture) {
      const capSq = target.captured;
      if (typeof capSq !== "number") return null;
      captures.push(capSq);
      if (!isLast) {
        workingBoard = applyPartialCaptureStep(workingBoard, current, to, capSq);
      }
    } else if (!isLast) {
      return null;
    }

    current = to;
  }

  return captures.length > 0
    ? applyCompleteCaptureMove(board, from, travelled, captures, side)
    : applyEngineMove(board, {
        from,
        to: travelled[travelled.length - 1],
        path: travelled,
        captures: [],
        side,
      });
}
