import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import { boardStateToFen } from "../../features/board/fenUtils";

export type EngineSide = "W" | "B";

export type EngineTarget = {
  to: number;
  isCapture: boolean;
  captured?: number;
};

export type EngineMove = {
  from: number;
  to: number;
  path: number[];
  captures: number[];
  side: EngineSide;
  notation: string;
  fenAfter: string;
};

export type CaptureSequence = {
  from: number;
  to: number;
  path: number[];
  captures: number[];
};

type Coord = {
  row: number;
  col: number;
};

const KING_DIRS = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export function cloneBoard(board: BoardState): BoardState {
  return {
    sideToMove: board.sideToMove,
    squares: { ...board.squares },
  };
}

export function getPieceSide(piece: PieceCode): EngineSide | null {
  if (piece === "wm" || piece === "wk") return "W";
  if (piece === "bm" || piece === "bk") return "B";
  return null;
}

export function isMan(piece: PieceCode): boolean {
  return piece === "wm" || piece === "bm";
}

export function isKing(piece: PieceCode): boolean {
  return piece === "wk" || piece === "bk";
}

export function opponentOf(side: EngineSide): EngineSide {
  return side === "W" ? "B" : "W";
}

export function squareToCoord(square: number): Coord {
  const row = Math.floor((square - 1) / 5);
  const posInRow = (square - 1) % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
}

export function coordToSquare(row: number, col: number): number | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  if ((row + col) % 2 === 0) return null;

  const posInRow = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  if (!Number.isInteger(posInRow) || posInRow < 0 || posInRow > 4) return null;

  return row * 5 + posInRow + 1;
}

export function shouldPromote(square: number, piece: PieceCode): boolean {
  if (!isMan(piece)) return false;

  const { row } = squareToCoord(square);

  if (piece === "wm" && row === 0) return true;
  if (piece === "bm" && row === 9) return true;

  return false;
}

export function promotePiece(piece: PieceCode): PieceCode {
  if (piece === "wm") return "wk";
  if (piece === "bm") return "bk";
  return piece;
}

export function buildNotation(path: number[], isCapture: boolean): string {
  return path.join(isCapture ? "x" : "-");
}

export function getStepMoveTargetsForMan(from: number, side: EngineSide): number[] {
  const { row, col } = squareToCoord(from);
  const dr = side === "W" ? -1 : 1;

  return [
    coordToSquare(row + dr, col - 1),
    coordToSquare(row + dr, col + 1),
  ].filter((v): v is number => v !== null);
}

export function getCaptureTargetsForMan(
  board: BoardState,
  from: number,
  side: EngineSide,
  capturedSet: Set<number> = new Set()
): { to: number; captured: number }[] {
  const { row, col } = squareToCoord(from);
  const enemy = opponentOf(side);

  const deltas = [
    { dr: -2, dc: -2 },
    { dr: -2, dc: 2 },
    { dr: 2, dc: -2 },
    { dr: 2, dc: 2 },
  ];

  const results: { to: number; captured: number }[] = [];

  for (const delta of deltas) {
    const landing = coordToSquare(row + delta.dr, col + delta.dc);
    const middle = coordToSquare(row + delta.dr / 2, col + delta.dc / 2);

    if (landing === null || middle === null) continue;
    if (capturedSet.has(middle)) continue;

    const middlePiece = board.squares[middle];
    const landingPiece = board.squares[landing];

    if (getPieceSide(middlePiece) === enemy && landingPiece === "empty") {
      results.push({ to: landing, captured: middle });
    }
  }

  return results;
}

export function getStepMoveTargetsForKing(board: BoardState, from: number): number[] {
  const { row, col } = squareToCoord(from);
  const results: number[] = [];

  for (const dir of KING_DIRS) {
    let r = row + dir.dr;
    let c = col + dir.dc;

    while (true) {
      const sq = coordToSquare(r, c);
      if (sq === null) break;
      if (board.squares[sq] !== "empty") break;
      results.push(sq);
      r += dir.dr;
      c += dir.dc;
    }
  }

  return results;
}

export function getCaptureTargetsForKing(
  board: BoardState,
  from: number,
  side: EngineSide,
  capturedSet: Set<number> = new Set()
): { to: number; captured: number }[] {
  const { row, col } = squareToCoord(from);
  const enemy = opponentOf(side);
  const results: { to: number; captured: number }[] = [];

  for (const dir of KING_DIRS) {
    let r = row + dir.dr;
    let c = col + dir.dc;
    let seenEnemySquare: number | null = null;

    while (true) {
      const sq = coordToSquare(r, c);
      if (sq === null) break;

      const piece = board.squares[sq];
      const pieceSide = getPieceSide(piece);

      if (piece === "empty") {
        if (seenEnemySquare !== null) {
          results.push({
            to: sq,
            captured: seenEnemySquare,
          });
        }
        r += dir.dr;
        c += dir.dc;
        continue;
      }

      if (capturedSet.has(sq)) {
        break;
      }

      if (pieceSide === side) {
        break;
      }

      if (pieceSide === enemy) {
        if (seenEnemySquare !== null) {
          break;
        }
        seenEnemySquare = sq;
        r += dir.dr;
        c += dir.dc;
        continue;
      }

      break;
    }
  }

  return results;
}

export function applyPartialCaptureStep(
  board: BoardState,
  from: number,
  to: number,
  _captured: number
): BoardState {
  const next = cloneBoard(board);
  const piece = next.squares[from];

  next.squares[from] = "empty";
  next.squares[to] = piece;

  return next;
}

function getImmediateCaptureTargets(
  board: BoardState,
  from: number,
  capturedSet: Set<number>
): { to: number; captured: number }[] {
  const piece = board.squares[from];
  const side = board.sideToMove;

  if (piece === "empty") return [];
  if (getPieceSide(piece) !== side) return [];

  if (isMan(piece)) {
    return getCaptureTargetsForMan(board, from, side, capturedSet);
  }

  if (isKing(piece)) {
    return getCaptureTargetsForKing(board, from, side, capturedSet);
  }

  return [];
}

function collectCaptureSequencesRecursive(
  board: BoardState,
  from: number,
  origin: number,
  path: number[],
  captures: number[],
  capturedSet: Set<number>
): CaptureSequence[] {
  const piece = board.squares[from];
  if (piece === "empty") return [];

  const immediateTargets = getImmediateCaptureTargets(board, from, capturedSet);

  if (immediateTargets.length === 0) {
    if (captures.length === 0) return [];
    return [
      {
        from: origin,
        to: from,
        path,
        captures,
      },
    ];
  }

  const sequences: CaptureSequence[] = [];

  for (const target of immediateTargets) {
    const nextBoard = applyPartialCaptureStep(board, from, target.to, target.captured);
    const nextCapturedSet = new Set(capturedSet);
    nextCapturedSet.add(target.captured);

    const childSequences = collectCaptureSequencesRecursive(
      nextBoard,
      target.to,
      origin,
      [...path, target.to],
      [...captures, target.captured],
      nextCapturedSet
    );

    if (childSequences.length > 0) {
      sequences.push(...childSequences);
    } else {
      sequences.push({
        from: origin,
        to: target.to,
        path: [...path, target.to],
        captures: [...captures, target.captured],
      });
    }
  }

  return sequences;
}

export function getAllCaptureSequencesForSquare(
  board: BoardState,
  from: number
): CaptureSequence[] {
  const piece = board.squares[from];
  if (piece === "empty") return [];
  if (getPieceSide(piece) !== board.sideToMove) return [];

  return collectCaptureSequencesRecursive(
    board,
    from,
    from,
    [from],
    [],
    new Set()
  );
}

export function getMaxCaptureCount(board: BoardState): number {
  let max = 0;

  for (let square = 1; square <= 50; square += 1) {
    const piece = board.squares[square];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== board.sideToMove) continue;

    const sequences = getAllCaptureSequencesForSquare(board, square);
    for (const seq of sequences) {
      max = Math.max(max, seq.captures.length);
    }
  }

  return max;
}

export function hasAnyCapture(board: BoardState): boolean {
  return getMaxCaptureCount(board) > 0;
}

/**
 * True when the side to move can open a maximal capture in more than one distinct way
 * (multiple pieces and/or multiple first hops with the same capture count).
 * In that case autoplay (e.g. engine best move) should not pick arbitrarily.
 */
export function hasCaptureSequenceChoice(board: BoardState): boolean {
  const globalMax = getMaxCaptureCount(board);
  if (globalMax <= 0) return false;

  const keys = new Set<string>();

  for (let sq = 1; sq <= 50; sq += 1) {
    const piece = board.squares[sq];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== board.sideToMove) continue;

    const targets = getTargetsForSquare(board, sq);
    for (const t of targets) {
      if (!t.isCapture || t.captured == null) continue;
      keys.add(`${sq}-${t.to}-${t.captured}`);
    }
  }

  return keys.size > 1;
}

/** When captures are forced and there is exactly one maximal opening hop, return it. */
export function getSoleMaximalCaptureOpening(board: BoardState): {
  from: number;
  to: number;
  captured: number;
} | null {
  const globalMax = getMaxCaptureCount(board);
  if (globalMax <= 0) return null;

  const openings: { from: number; to: number; captured: number }[] = [];
  const seen = new Set<string>();

  for (let sq = 1; sq <= 50; sq += 1) {
    const piece = board.squares[sq];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== board.sideToMove) continue;

    const targets = getTargetsForSquare(board, sq);
    for (const t of targets) {
      if (!t.isCapture || t.captured == null) continue;
      const key = `${sq}-${t.to}-${t.captured}`;
      if (seen.has(key)) continue;
      seen.add(key);
      openings.push({ from: sq, to: t.to, captured: t.captured });
    }
  }

  if (openings.length === 1) return openings[0] ?? null;
  if (openings.length === 0) return null;

  // Auto-pick when alternatives are equivalent for user flow:
  // multiple captures but same from->to endpoint (different captured ids/order details).
  const first = openings[0]!;
  const sameEndpoint = openings.every((o) => o.from === first.from && o.to === first.to);
  return sameEndpoint ? first : null;
}

export function getCaptureSourcesForSide(board: BoardState): number[] {
  const globalMax = getMaxCaptureCount(board);
  if (globalMax <= 0) return [];

  const result: number[] = [];

  for (let square = 1; square <= 50; square += 1) {
    const piece = board.squares[square];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== board.sideToMove) continue;

    const sequences = getAllCaptureSequencesForSquare(board, square);
    const canReachGlobalMax = sequences.some(
      (seq) => seq.captures.length === globalMax
    );

    if (canReachGlobalMax) {
      result.push(square);
    }
  }

  return result;
}

export function getRawTargetsForSquare(
  board: BoardState,
  from: number
): EngineTarget[] {
  const piece = board.squares[from];
  const side = board.sideToMove;

  if (piece === "empty") return [];
  if (getPieceSide(piece) !== side) return [];

  if (isMan(piece)) {
    const captures = getCaptureTargetsForMan(board, from, side, new Set());
    if (captures.length > 0) {
      return captures.map((t) => ({
        to: t.to,
        isCapture: true,
        captured: t.captured,
      }));
    }

    return getStepMoveTargetsForMan(from, side)
      .filter((to) => board.squares[to] === "empty")
      .map((to) => ({
        to,
        isCapture: false,
      }));
  }

  if (isKing(piece)) {
    const captures = getCaptureTargetsForKing(board, from, side, new Set());
    if (captures.length > 0) {
      return captures.map((t) => ({
        to: t.to,
        isCapture: true,
        captured: t.captured,
      }));
    }

    return getStepMoveTargetsForKing(board, from).map((to) => ({
      to,
      isCapture: false,
    }));
  }

  return [];
}

export function getTargetsForSquare(
  board: BoardState,
  from: number
): EngineTarget[] {
  const piece = board.squares[from];
  if (piece === "empty") return [];
  if (getPieceSide(piece) !== board.sideToMove) return [];

  const globalMax = getMaxCaptureCount(board);

  if (globalMax > 0) {
    const sequences = getAllCaptureSequencesForSquare(board, from).filter(
      (seq) => seq.captures.length === globalMax
    );

    if (sequences.length === 0) return [];

    const uniqueTargets = new Map<number, EngineTarget>();

    for (const seq of sequences) {
      if (seq.path.length < 2 || seq.captures.length < 1) continue;

      const immediateTo = seq.path[1];
      const immediateCaptured = seq.captures[0];

      uniqueTargets.set(immediateTo, {
        to: immediateTo,
        isCapture: true,
        captured: immediateCaptured,
      });
    }

    return Array.from(uniqueTargets.values());
  }

  return getRawTargetsForSquare(board, from);
}

export function isSelectableSourceSquare(board: BoardState, square: number): boolean {
  const piece = board.squares[square];
  if (piece === "empty") return false;
  if (getPieceSide(piece) !== board.sideToMove) return false;
  return getTargetsForSquare(board, square).length > 0;
}

export function getContinuationCaptureTargets(
  board: BoardState,
  from: number,
  originPath?: number[],
  originCaptures?: number[]
): EngineTarget[] {
  const piece = board.squares[from];
  if (piece === "empty") return [];
  if (getPieceSide(piece) !== board.sideToMove) return [];

  const capturedSet = new Set(originCaptures ?? []);
  const immediateTargets = getImmediateCaptureTargets(board, from, capturedSet);

  if (immediateTargets.length === 0) return [];

  if (!originPath || !originCaptures) {
    return immediateTargets.map((target) => ({
      to: target.to,
      isCapture: true,
      captured: target.captured,
    }));
  }

  let bestTotalCaptureCount = -1;
  const candidateTargets: EngineTarget[] = [];

  for (const target of immediateTargets) {
    const nextBoard = applyPartialCaptureStep(board, from, target.to, target.captured);
    const nextCapturedSet = new Set(capturedSet);
    nextCapturedSet.add(target.captured);

    const continuationSequences = collectCaptureSequencesRecursive(
      nextBoard,
      target.to,
      from,
      [from, target.to],
      [target.captured],
      nextCapturedSet
    );

    const bestTailCount =
      continuationSequences.length > 0
        ? Math.max(...continuationSequences.map((seq) => seq.captures.length))
        : 1;

    const totalCount = originCaptures.length + bestTailCount;

    if (totalCount > bestTotalCaptureCount) {
      bestTotalCaptureCount = totalCount;
      candidateTargets.length = 0;
      candidateTargets.push({
        to: target.to,
        isCapture: true,
        captured: target.captured,
      });
    } else if (totalCount === bestTotalCaptureCount) {
      candidateTargets.push({
        to: target.to,
        isCapture: true,
        captured: target.captured,
      });
    }
  }

  return candidateTargets;
}

export function applyCompleteCaptureMove(
  startBoard: BoardState,
  origin: number,
  path: number[],
  captures: number[],
  side: EngineSide
): EngineMove {
  const next = cloneBoard(startBoard);
  const piece = next.squares[origin];
  const finalSquare = path[path.length - 1];

  next.squares[origin] = "empty";

  for (const captured of captures) {
    next.squares[captured] = "empty";
  }

  const finalPiece = shouldPromote(finalSquare, piece)
    ? promotePiece(piece)
    : piece;

  next.squares[finalSquare] = finalPiece;
  next.sideToMove = next.sideToMove === "W" ? "B" : "W";

  return {
    from: origin,
    to: finalSquare,
    path,
    captures,
    side,
    notation: buildNotation(path, true),
    fenAfter: boardStateToFen(next),
  };
}

export function applyEngineMove(
  board: BoardState,
  move: {
    from: number;
    to: number;
    path: number[];
    captures: number[];
    side: EngineSide;
  }
): EngineMove {
  const next = cloneBoard(board);
  const piece = next.squares[move.from];

  next.squares[move.from] = "empty";

  for (const captured of move.captures) {
    next.squares[captured] = "empty";
  }

  const landedPiece = shouldPromote(move.to, piece)
    ? promotePiece(piece)
    : piece;

  next.squares[move.to] = landedPiece;
  next.sideToMove = next.sideToMove === "W" ? "B" : "W";

  return {
    ...move,
    notation: buildNotation(move.path, move.captures.length > 0),
    fenAfter: boardStateToFen(next),
  };
}