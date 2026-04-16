import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardState, PieceCode } from "../board/boardTypes";
import {
  getContinuationCaptureTargets,
  getSoleMaximalCaptureOpening,
  getTargetsForSquare,
  isSelectableSourceSquare,
} from "../../lesson-system/source-editor/sourceBoardEngine";
import { fenToBoardState } from "../board/fenUtils";
import { resolveNotationToEngineMove } from "../../lesson-system/utils/resolveNotationToEngineMove";

type Side = "W" | "B";

export type RecordedMove = {
  from: number;
  path: number[];
  to: number;
  captures: number[];
  side: Side;
  notation: string;
};

type RecorderState = {
  isRecording: boolean;
  moves: RecordedMove[];
  startBoard: BoardState;
  board: BoardState;
  selectedFrom: number | null;

  chainFrom: number | null;
  chainPath: number[];
  chainCaptures: number[];
  chainPiece: PieceCode | "empty";
  chainInProgress: boolean;
};

type Coord = {
  row: number;
  col: number;
};

export type RecorderTarget = {
  to: number;
  isCapture: boolean;
  captured?: number;
};

const cloneBoard = (board: BoardState): BoardState => ({
  sideToMove: board.sideToMove,
  squares: { ...board.squares },
});

const getPieceSide = (piece: PieceCode): Side | null => {
  if (piece === "wm" || piece === "wk") return "W";
  if (piece === "bm" || piece === "bk") return "B";
  return null;
};

const isMan = (piece: PieceCode) => piece === "wm" || piece === "bm";

const squareToCoord = (square: number): Coord => {
  const row = Math.floor((square - 1) / 5);
  const posInRow = (square - 1) % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
};

const buildNotation = (path: number[], isCapture: boolean): string => {
  const sep = isCapture ? "x" : "-";
  return path.join(sep);
};

const shouldPromote = (square: number, piece: PieceCode): boolean => {
  if (!isMan(piece)) return false;

  const { row } = squareToCoord(square);

  if (piece === "wm" && row === 0) return true;
  if (piece === "bm" && row === 9) return true;

  return false;
};

const promotePiece = (piece: PieceCode): PieceCode => {
  if (piece === "wm") return "wk";
  if (piece === "bm") return "bk";
  return piece;
};

const applyMoveToBoard = (
  board: BoardState,
  move: RecordedMove
): BoardState => {
  const next = cloneBoard(board);
  const piece = next.squares[move.from];

  next.squares[move.from] = "empty";
  for (const cap of move.captures) {
    next.squares[cap] = "empty";
  }

  const finalPiece = shouldPromote(move.to, piece) ? promotePiece(piece) : piece;
  next.squares[move.to] = finalPiece;
  next.sideToMove = next.sideToMove === "W" ? "B" : "W";

  return next;
};

/** Filled synchronously inside `handleClickSquare` so callers can read it before the next render. */
export type SquareClickMoveOutcome = {
  prevMoveCount: number;
  nextMoveCount: number;
  /** Moves appended by this click (usually one ply; rarely more). */
  addedMoves: RecordedMove[];
};

export function useSolutionRecorder(initialBoard: BoardState) {
  const lastSquareClickOutcomeRef = useRef<SquareClickMoveOutcome | null>(null);

  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    moves: [],
    startBoard: cloneBoard(initialBoard),
    board: cloneBoard(initialBoard),
    selectedFrom: null,
    chainFrom: null,
    chainPath: [],
    chainCaptures: [],
    chainPiece: "empty",
    chainInProgress: false,
  });

  const startRecording = (board: BoardState) => {
    lastSquareClickOutcomeRef.current = null;
    const nextBoard = cloneBoard(board);

    setState({
      isRecording: true,
      moves: [],
      startBoard: cloneBoard(nextBoard),
      board: cloneBoard(nextBoard),
      selectedFrom: null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    });
  };

  const beginRecordingAtBoardWithSquare = (board: BoardState, square: number) => {
    lastSquareClickOutcomeRef.current = null;
    const piece = board.squares[square];
    const side = board.sideToMove;
    const pieceSide = getPieceSide(piece);
    const startBoard = cloneBoard(board);

    const nextState: RecorderState = {
      isRecording: true,
      moves: [],
      startBoard: cloneBoard(startBoard),
      board: cloneBoard(startBoard),
      selectedFrom:
        piece !== "empty" && pieceSide === side ? square : null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    };

    setState(autoPlayForcedFromSelected(nextState));
  };

  const stopRecording = () => {
    setState((prev) => ({
      ...prev,
      isRecording: false,
      selectedFrom: null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    }));
  };

  const clearRecording = () => {
    lastSquareClickOutcomeRef.current = null;
    setState((prev) => ({
      ...prev,
      moves: [],
      selectedFrom: null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    }));
  };

  const resetToStartPosition = (startBoard: BoardState) => {
    lastSquareClickOutcomeRef.current = null;
    const nextStartBoard = cloneBoard(startBoard);

    setState((prev) => ({
      ...prev,
      isRecording: false,
      moves: [],
      startBoard: cloneBoard(nextStartBoard),
      board: cloneBoard(nextStartBoard),
      selectedFrom: null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    }));
  };

  const undo = () => {
    lastSquareClickOutcomeRef.current = null;
    setState((prev) => {
      const nextMoves = prev.moves.slice(0, -1);
      let rebuilt = cloneBoard(prev.startBoard);

      for (const move of nextMoves) {
        rebuilt = applyMoveToBoard(rebuilt, move);
      }

      return {
        ...prev,
        moves: nextMoves,
        board: rebuilt,
        selectedFrom: null,
        chainFrom: null,
        chainPath: [],
        chainCaptures: [],
        chainPiece: "empty",
        chainInProgress: false,
      };
    });
  };

  /** Append a fully-resolved engine move (e.g. Scan best move) without user clicks. */
  const appendExternalNotation = useCallback((notation: string) => {
    lastSquareClickOutcomeRef.current = null;
    setState((prev) => {
      if (!prev.isRecording) return prev;
      if (prev.chainInProgress) return prev;
      const em = resolveNotationToEngineMove(prev.board, notation);
      if (!em) return prev;
      const move: RecordedMove = {
        from: em.from,
        to: em.to,
        path: em.path,
        captures: em.captures,
        side: em.side,
        notation: em.notation,
      };
      let nextBoard: BoardState;
      try {
        nextBoard = fenToBoardState(em.fenAfter);
      } catch {
        return prev;
      }
      return {
        ...prev,
        board: nextBoard,
        moves: [...prev.moves, move],
        selectedFrom: null,
        chainFrom: null,
        chainPath: [],
        chainCaptures: [],
        chainPiece: "empty",
        chainInProgress: false,
      };
    });
  }, []);

  const commitSimpleMove = (
    prev: RecorderState,
    from: number,
    to: number
  ): RecorderState => {
    const piece = prev.board.squares[from];
    const side = prev.board.sideToMove;

    const newBoard = cloneBoard(prev.board);
    newBoard.squares[from] = "empty";

    const finalPiece = shouldPromote(to, piece) ? promotePiece(piece) : piece;
    newBoard.squares[to] = finalPiece;
    newBoard.sideToMove = side === "W" ? "B" : "W";

    const move: RecordedMove = {
      from,
      path: [from, to],
      to,
      captures: [],
      side,
      notation: buildNotation([from, to], false),
    };

    return {
      ...prev,
      board: newBoard,
      moves: [...prev.moves, move],
      selectedFrom: null,
      chainFrom: null,
      chainPath: [],
      chainCaptures: [],
      chainPiece: "empty",
      chainInProgress: false,
    };
  };

  const startCaptureChain = (
    prev: RecorderState,
    from: number,
    to: number,
    captured: number
  ): RecorderState => {
    const side = prev.board.sideToMove;
    const piece = prev.board.squares[from];

    const newBoard = cloneBoard(prev.board);
    newBoard.squares[from] = "empty";
    newBoard.squares[captured] = "empty";
    newBoard.squares[to] = piece;

    const continuationAfterFirst = getContinuationCaptureTargets(
      newBoard,
      to,
      [from, to],
      [captured]
    );

    if (continuationAfterFirst.length === 0) {
      const landedPiece = newBoard.squares[to];
      if (shouldPromote(to, landedPiece)) {
        newBoard.squares[to] = promotePiece(landedPiece);
      }

      newBoard.sideToMove = side === "W" ? "B" : "W";

      const move: RecordedMove = {
        from,
        path: [from, to],
        to,
        captures: [captured],
        side,
        notation: buildNotation([from, to], true),
      };

      return {
        ...prev,
        board: newBoard,
        moves: [...prev.moves, move],
        selectedFrom: null,
        chainFrom: null,
        chainPath: [],
        chainCaptures: [],
        chainPiece: "empty",
        chainInProgress: false,
      };
    }

    return autoPlayForcedFromSelected({
      ...prev,
      board: newBoard,
      selectedFrom: to,
      chainFrom: from,
      chainPath: [from, to],
      chainCaptures: [captured],
      chainPiece: piece,
      chainInProgress: true,
    });
  };

  const continueCaptureChain = (
    prev: RecorderState,
    to: number,
    captured: number
  ): RecorderState => {
    const side = prev.board.sideToMove;
    const currentFrom = prev.selectedFrom!;
    const originalFrom = prev.chainFrom!;
    const piece = prev.chainPiece;

    const newBoard = cloneBoard(prev.board);
    newBoard.squares[currentFrom] = "empty";
    newBoard.squares[captured] = "empty";
    newBoard.squares[to] = piece;

    const newPath = [...prev.chainPath, to];
    const newCaptures = [...prev.chainCaptures, captured];

    const continuationTargets = getContinuationCaptureTargets(
      newBoard,
      to,
      newPath,
      newCaptures
    );

    if (continuationTargets.length === 0) {
      const landedPiece = newBoard.squares[to];
      if (shouldPromote(to, landedPiece)) {
        newBoard.squares[to] = promotePiece(landedPiece);
      }

      newBoard.sideToMove = side === "W" ? "B" : "W";

      const move: RecordedMove = {
        from: originalFrom,
        path: newPath,
        to,
        captures: newCaptures,
        side,
        notation: buildNotation(newPath, true),
      };

      return {
        ...prev,
        board: newBoard,
        moves: [...prev.moves, move],
        selectedFrom: null,
        chainFrom: null,
        chainPath: [],
        chainCaptures: [],
        chainPiece: "empty",
        chainInProgress: false,
      };
    }

    return autoPlayForcedFromSelected({
      ...prev,
      board: newBoard,
      selectedFrom: to,
      chainFrom: originalFrom,
      chainPath: newPath,
      chainCaptures: newCaptures,
      chainPiece: piece,
      chainInProgress: true,
    });
  };

  const autoPlayForcedFromSelected = (input: RecorderState): RecorderState => {
    const pickAutoForcedTarget = (targets: RecorderTarget[]): RecorderTarget | null => {
      if (targets.length === 1) return targets[0] ?? null;
      if (targets.length === 0) return null;
      const first = targets[0]!;
      const sameTo = targets.every((t) => t.to === first.to);
      // Only auto-pick equivalence for capture continuations; different landing squares require user choice.
      if (first.isCapture && sameTo) return first;
      return null;
    };

    let next = input;

    while (next.selectedFrom != null) {
      const from = next.selectedFrom;
      const targets = next.chainInProgress
        ? getContinuationCaptureTargets(
            next.board,
            from,
            next.chainPath,
            next.chainCaptures
          )
        : getTargetsForSquare(next.board, from);

      const only = pickAutoForcedTarget(targets);
      if (!only) return next;

      if (only.isCapture) {
        if (only.captured == null) return next;
        next = next.chainInProgress
          ? continueCaptureChain(next, only.to, only.captured)
          : startCaptureChain(next, from, only.to, only.captured);
        continue;
      }

      if (next.chainInProgress) return next;
      next = commitSimpleMove(next, from, only.to);
      return next;
    }

    return next;
  };

  const startCaptureChainRef = useRef(startCaptureChain);
  startCaptureChainRef.current = startCaptureChain;

  const applySoleForcedMaximalCaptureIfUnambiguous = useCallback(() => {
    lastSquareClickOutcomeRef.current = null;
    setState((prev) => {
      if (!prev.isRecording) return prev;
      if (prev.chainInProgress || prev.selectedFrom !== null) return prev;
      const opening = getSoleMaximalCaptureOpening(prev.board);
      if (!opening) return prev;
      return startCaptureChainRef.current(
        prev,
        opening.from,
        opening.to,
        opening.captured
      );
    });
  }, []);

  /** Dry-run sole forced apply: full path notation only when the chain completes in one update (new move recorded). */
  const previewSoleForcedApply = useCallback((): { notation: string } | null => {
    const prev = state;
    if (!prev.isRecording) return null;
    if (prev.chainInProgress || prev.selectedFrom !== null) return null;
    const opening = getSoleMaximalCaptureOpening(prev.board);
    if (!opening) return null;
    const next = startCaptureChainRef.current(
      prev,
      opening.from,
      opening.to,
      opening.captured
    );
    if (next.moves.length <= prev.moves.length) return null;
    return { notation: next.moves[next.moves.length - 1].notation };
  }, [state]);

  const handleClickSquare = (square: number) => {
    lastSquareClickOutcomeRef.current = null;
    setState((prev) => {
      if (!prev.isRecording) return prev;

      const board = prev.board;
      const side = board.sideToMove;
      const piece = board.squares[square];
      const pieceSide = getPieceSide(piece);

      const finish = (next: RecorderState) => {
        if (next.moves.length > prev.moves.length) {
          lastSquareClickOutcomeRef.current = {
            prevMoveCount: prev.moves.length,
            nextMoveCount: next.moves.length,
            addedMoves: next.moves.slice(prev.moves.length),
          };
        }
        return next;
      };

      if (prev.selectedFrom === null) {
        if (piece === "empty") return prev;
        if (pieceSide !== side) return prev;
        if (!isSelectableSourceSquare(board, square)) return prev;
        return finish(
          autoPlayForcedFromSelected({
            ...prev,
            selectedFrom: square,
          })
        );
      }

      const from = prev.selectedFrom;
      const selectedPiece = board.squares[from];
      const selectedSide = getPieceSide(selectedPiece);

      if (selectedSide !== side) return prev;

      if (piece !== "empty" && pieceSide === side) {
        if (!isSelectableSourceSquare(board, square)) return prev;
        return finish(
          autoPlayForcedFromSelected({
            ...prev,
            selectedFrom: square,
            ...(prev.chainInProgress
              ? {}
              : {
                  chainFrom: null,
                  chainPath: [],
                  chainCaptures: [],
                  chainPiece: "empty",
                }),
          })
        );
      }

      const target = prev.chainInProgress
        ? getContinuationCaptureTargets(
            board,
            from,
            prev.chainPath,
            prev.chainCaptures
          ).find((x) => x.to === square)
        : getTargetsForSquare(board, from).find((x) => x.to === square);

      if (!target) return prev;

      if (target.isCapture && target.captured != null) {
        if (prev.chainInProgress) {
          return finish(continueCaptureChain(prev, square, target.captured));
        }
        return finish(startCaptureChain(prev, from, square, target.captured));
      }

      if (prev.chainInProgress) return prev;
      return finish(commitSimpleMove(prev, from, square));
    });
  };

  const consumeLastSquareClickOutcome = useCallback((): SquareClickMoveOutcome | null => {
    const v = lastSquareClickOutcomeRef.current;
    lastSquareClickOutcomeRef.current = null;
    return v;
  }, []);

  const getNotationList = () => state.moves.map((m) => m.notation);

  const legalTargets = useMemo<RecorderTarget[]>(() => {
    if (!state.isRecording || state.selectedFrom === null) return [];
    if (state.chainInProgress) {
      return getContinuationCaptureTargets(
        state.board,
        state.selectedFrom,
        state.chainPath,
        state.chainCaptures
      );
    }
    return getTargetsForSquare(state.board, state.selectedFrom);
  }, [state]);

  return {
    state,
    startRecording,
    beginRecordingAtBoardWithSquare,
    stopRecording,
    clearRecording,
    resetToStartPosition,
    undo,
    appendExternalNotation,
    applySoleForcedMaximalCaptureIfUnambiguous,
    previewSoleForcedApply,
    handleClickSquare,
    consumeLastSquareClickOutcome,
    getNotationList,
    legalTargets,
  };
}