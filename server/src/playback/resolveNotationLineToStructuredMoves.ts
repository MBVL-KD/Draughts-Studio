/**
 * Resolves a list of PD notations from an initial FEN into structured moves
 * (notation, from, to, path, captures, fenAfter). Mirrors Studio preview logic.
 *
 * Notatie-conventie (PDN / studio):
 * - `-` alleen tussen velden bij een **gewone** zet (geen slag), bv. `32-27`.
 * - `x` tussen opeenvolgende **landings**velden bij meerslag, bv. `23x32x43x34`.
 * Slagzet-import met koppeltekens bij meerslag: `van-eindveld-geslagen1-geslagen2-…` (tweede veld = laatste
 * landing; daarna de geslagen stuk-velden in **slagvolgorde**), bv. `23-34-28-38-39` ≡ `23x32x43x34`.
 * Oudere regels draaiden die lijst om; {@link resolveImportedCaptureSpecWithAlternates} probeert beide.
 */
import type { BoardState } from "./draughts/boardTypes";
import { boardStateToFen, fenToBoardState } from "./draughts/fenUtils";
import {
  applyCompleteCaptureMove,
  applyEngineMove,
  applyPartialCaptureStep,
  cloneBoard,
  getAllCaptureSequencesForSquare,
  getContinuationCaptureTargets,
  getMaxCaptureCount,
  getPieceSide,
  getTargetsForSquare,
  type CaptureSequence,
  type EngineSide,
} from "./draughts/sourceBoardEngine";

export type StructuredPlaybackMove = {
  notation: string;
  from: number;
  to: number;
  path: number[];
  captures: number[];
  fenAfter: string;
};

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

/**
 * Slagzet / import compact capture encoding:
 * - `from-to-captured1-captured2-...` (legacy with `-`)
 * - `fromxto xcaptured1xcaptured2x...` (same payload sometimes emitted with `x`)
 * In both forms, token #2 is the final landing square; remaining tokens are captured squares.
 */
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
  const rawCaptures = parts.slice(2);
  if (!rawCaptures.length) return null;
  return {
    from,
    to,
    captures: [...rawCaptures],
  };
}

function resolveImportedCaptureSpecWithAlternates(
  board: BoardState,
  spec: { from: number; to: number; captures: number[] }
): StructuredPlaybackMove | null {
  const direct = resolveImportedCaptureSpec(board, spec);
  if (direct) return direct;
  const rev = [...spec.captures].reverse();
  if (!arraysEqual(rev, spec.captures)) {
    const viaReverse = resolveImportedCaptureSpec(board, { ...spec, captures: rev });
    if (viaReverse) return viaReverse;
  }

  // Legacy safety net: if capture order is noisy but from/to + captured set uniquely
  // identify one maximal capture line, normalize to that canonical engine move.
  const maxCap = getMaxCaptureCount(board);
  if (maxCap <= 0) return null;
  const side = board.sideToMove as EngineSide;
  const matches = getAllCaptureSequencesForSquare(board, spec.from).filter(
    (seq) =>
      seq.captures.length === maxCap &&
      seq.to === spec.to &&
      captureMultisetEqual(seq.captures, spec.captures)
  );
  if (matches.length !== 1) return null;
  const picked = matches[0]!;
  const em = applyCompleteCaptureMove(board, picked.from, picked.path, picked.captures, side);
  return {
    notation: em.notation,
    from: em.from,
    to: em.to,
    path: em.path,
    captures: em.captures,
    fenAfter: em.fenAfter,
  };
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function captureMultisetEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return arraysEqual(as, bs);
}

/**
 * Geïmporteerde hyphen-strings als volledige landingsroute van één maximale slag
 * (zelfde squares als engine `path`).
 */
function findMaximalSequenceMatchingPath(board: BoardState, wantPath: number[]): CaptureSequence | null {
  if (wantPath.length < 2) return null;
  const maxCap = getMaxCaptureCount(board);
  if (maxCap <= 0) return null;
  const side = board.sideToMove;
  const matches: CaptureSequence[] = [];
  for (let sq = 1; sq <= 50; sq += 1) {
    const piece = board.squares[sq];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== side) continue;
    for (const seq of getAllCaptureSequencesForSquare(board, sq)) {
      if (seq.captures.length !== maxCap) continue;
      if (arraysEqual(seq.path, wantPath)) matches.push(seq);
    }
  }
  if (matches.length === 1) return matches[0] ?? null;
  return null;
}

function resolveImportedCaptureSpec(
  board: BoardState,
  spec: { from: number; to: number; captures: number[] }
): StructuredPlaybackMove | null {
  const side = board.sideToMove as EngineSide;
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
      // Prefix prune for expected captured sequence.
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
    const engineMove = applyCompleteCaptureMove(board, spec.from, hit.path, hit.captures, side);
    return {
      notation: engineMove.notation,
      from: engineMove.from,
      to: engineMove.to,
      path: engineMove.path,
      captures: engineMove.captures,
      fenAfter: engineMove.fenAfter,
    };
  }
  return null;
}

function applyNotationMoveWithEngine(board: BoardState, notation: string): StructuredPlaybackMove | null {
  const trimmed = notation.trim();
  const path = parseNotationPath(trimmed);
  if (!path) return null;

  const side = board.sideToMove as EngineSide;

  // Hyphen-route = volledige meerslag zonder `x`: match één maximale slag → canonieke `x`-notatie.
  if (!trimmed.includes("x")) {
    const maxCap = getMaxCaptureCount(board);
    if (maxCap > 0 && path.length >= 2) {
      const full = findMaximalSequenceMatchingPath(board, path);
      if (full) {
        const em = applyCompleteCaptureMove(board, full.from, full.path, full.captures, side);
        return {
          notation: em.notation,
          from: em.from,
          to: em.to,
          path: em.path,
          captures: em.captures,
          fenAfter: em.fenAfter,
        };
      }
    }
  }

  const from = path[0]!;
  const travelled: number[] = [from];
  const captures: number[] = [];
  let current = from;
  let workingBoard = cloneBoard(board);

  for (let index = 1; index < path.length; index += 1) {
    const to = path[index]!;
    const targets =
      captures.length === 0
        ? getTargetsForSquare(workingBoard, current)
        : getContinuationCaptureTargets(workingBoard, current, travelled, captures);
    const target = targets.find((candidate) => candidate.to === to);
    if (!target) {
      const imported = parseImportedCaptureSpec(trimmed);
      if (imported) {
        return resolveImportedCaptureSpecWithAlternates(board, imported);
      }
      return null;
    }

    travelled.push(to);
    const isLast = index === path.length - 1;
    const isCapture = !!target.isCapture && typeof target.captured === "number";

    if (isCapture) {
      captures.push(target.captured);
      if (!isLast) {
        workingBoard = applyPartialCaptureStep(workingBoard, current, to, target.captured);
      }
    } else if (!isLast) {
      return null;
    }

    current = to;
  }

  const engineMove =
    captures.length > 0
      ? applyCompleteCaptureMove(board, from, travelled, captures, side)
      : applyEngineMove(board, {
          from,
          to: travelled[travelled.length - 1],
          path: travelled,
          captures: [],
          side,
        });

  return {
    notation: engineMove.notation,
    from: engineMove.from,
    to: engineMove.to,
    path: engineMove.path,
    captures: engineMove.captures,
    fenAfter: engineMove.fenAfter,
  };
}

export type SequenceLineResolveDebug = {
  initialFen: string;
  authoringMoves: string[];
  /** Index in authoringMoves where resolution failed, or null if FEN was invalid / empty. */
  failedAtMoveIndex: number | null;
  /** FEN immediately before the failed notation was applied (same as initialFen if failed on first move). */
  fenBeforeFailedMove?: string;
  failedNotation?: string;
};

/**
 * Same as {@link resolveNotationLineToStructuredMoves} but returns debug when the line cannot be resolved.
 */
export function resolveNotationLineToStructuredMovesDetailed(
  initialFen: string,
  notations: string[]
):
  | { ok: true; moves: StructuredPlaybackMove[] }
  | { ok: false; moves: StructuredPlaybackMove[]; debug: SequenceLineResolveDebug } {
  const cleaned = (initialFen ?? "").trim();
  const list = notations.map((n) => String(n ?? "").trim()).filter(Boolean);

  const baseDebug: SequenceLineResolveDebug = {
    initialFen: cleaned,
    authoringMoves: list,
    failedAtMoveIndex: null,
  };

  if (!cleaned) {
    return {
      ok: false,
      moves: [],
      debug: { ...baseDebug, failedAtMoveIndex: null, fenBeforeFailedMove: undefined },
    };
  }

  let board: BoardState;
  try {
    board = fenToBoardState(cleaned);
  } catch {
    return {
      ok: false,
      moves: [],
      debug: { ...baseDebug, failedAtMoveIndex: null },
    };
  }

  const out: StructuredPlaybackMove[] = [];
  let fenBeforeThisMove = cleaned;

  for (let i = 0; i < list.length; i += 1) {
    const notation = list[i];
    fenBeforeThisMove = boardStateToFen(board);
    const structured = applyNotationMoveWithEngine(board, notation);
    if (!structured) {
      return {
        ok: false,
        moves: out,
        debug: {
          ...baseDebug,
          failedAtMoveIndex: i,
          fenBeforeFailedMove: fenBeforeThisMove,
          failedNotation: notation,
        },
      };
    }
    out.push(structured);
    try {
      board = fenToBoardState(structured.fenAfter);
    } catch {
      return {
        ok: false,
        moves: out,
        debug: {
          ...baseDebug,
          failedAtMoveIndex: i,
          fenBeforeFailedMove: fenBeforeThisMove,
          failedNotation: notation,
        },
      };
    }
  }

  return { ok: true, moves: out };
}

/**
 * Resolves each notation in order, advancing the board. Returns null if any move fails to resolve.
 */
export function resolveNotationLineToStructuredMoves(
  initialFen: string,
  notations: string[]
): StructuredPlaybackMove[] | null {
  const r = resolveNotationLineToStructuredMovesDetailed(initialFen, notations);
  return r.ok ? r.moves : null;
}
