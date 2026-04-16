import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import BoardEditor from "../../features/board/BoardEditor";
import {
  createEmptyBoardState,
  type BoardState,
  type PieceCode,
} from "../../features/board/boardTypes";
import type { SourceBoardMode } from "../source-editor/sourceBoardTypes";
import type {
  SetupBrush,
  BoardMoveSubmitEvent,
} from "../source-editor/sourceBoardAdapter";
import {
  applyCompleteCaptureMove,
  applyEngineMove,
  applyPartialCaptureStep,
  getPieceSide,
  getTargetsForSquare,
  getContinuationCaptureTargets,
  isSelectableSourceSquare,
  type EngineMove,
  type EngineTarget,
} from "../source-editor/sourceBoardEngine";
import type { ArrowSpec, HighlightSpec } from "../types/presentationTypes";
import BoardOverlayLayer from "./BoardOverlayLayer";
import NotationMoveAnimationOverlay from "./NotationMoveAnimationOverlay";
import {
  getPlayableSquareCountFromBoard,
  inferBoardSizeFromPlayableSquares,
} from "../utils/boardOverlayGeometry";
import {
  computeNotationAnimFrame,
  prepareNotationAnimFromEngineMove,
  readStudioMoveAnimationSeconds,
  runNotationMoveAnimation,
  type NotationAnimMetadata,
} from "../utils/notationMoveAnimation";

export type AnalysisBoardInteraction = "play" | "annotate-highlight" | "annotate-arrow";

type Props = {
  fen: string;
  mode: SourceBoardMode;
  setupBrush: SetupBrush;
  flipped?: boolean;
  bestMoveNotation?: string | null;
  showBoardFrame?: boolean;
  onMovePlayed: (event: BoardMoveSubmitEvent) => void;
  onFenEdited: (fen: string) => void;
  /** When set in play mode, square clicks call annotate handlers instead of playing moves. */
  boardInteraction?: AnalysisBoardInteraction;
  layerHighlights?: HighlightSpec[];
  layerArrows?: ArrowSpec[];
  onAnnotateHighlightClick?: (square: number) => void;
  onAnnotateArrowClick?: (square: number) => void;
  /** When omitted, uses `studio.replayMoveSecondsPerStep` from localStorage for auto-single-move animation. */
  moveAnimationSeconds?: number;
  /** Extra absolutely positioned layers inside the square board area (e.g. navigation ghosts). */
  externalBoardOverlay?: ReactNode;
};

type CaptureChainState = {
  origin: number;
  current: number;
  path: number[];
  captures: number[];
  startBoard: BoardState;
} | null;

function safelyParseFen(fen: string): BoardState {
  try {
    if (!fen.trim()) return createEmptyBoardState();
    return fenToBoardState(fen);
  } catch {
    return createEmptyBoardState();
  }
}

function autoPlayForcedMoveChain(
  board: BoardState,
  from: number,
  legalTargets: EngineTarget[]
): BoardMoveSubmitEvent | null {
  if (legalTargets.length !== 1) return null;

  const firstTarget = legalTargets[0];

  if (!firstTarget.isCapture) {
    const result = applyEngineMove(board, {
      from,
      to: firstTarget.to,
      path: [from, firstTarget.to],
      captures: [],
      side: board.sideToMove,
    });
    return {
      notation: result.notation,
      from: result.from,
      to: result.to,
      path: result.path,
      captures: result.captures,
      side: result.side,
      fenAfter: result.fenAfter,
    };
  }

  if (firstTarget.captured == null) return null;

  let workingBoard = applyPartialCaptureStep(board, from, firstTarget.to, firstTarget.captured);
  let current = firstTarget.to;
  let path = [from, firstTarget.to];
  let captures = [firstTarget.captured];

  while (true) {
    const continuationTargets = getContinuationCaptureTargets(workingBoard, current, path, captures);

    if (continuationTargets.length === 0) {
      const result = applyCompleteCaptureMove(board, from, path, captures, board.sideToMove);
      return {
        notation: result.notation,
        from: result.from,
        to: result.to,
        path: result.path,
        captures: result.captures,
        side: result.side,
        fenAfter: result.fenAfter,
      };
    }

    if (continuationTargets.length > 1) return null;

    const onlyTarget = continuationTargets[0];
    if (onlyTarget.captured == null) return null;

    workingBoard = applyPartialCaptureStep(workingBoard, current, onlyTarget.to, onlyTarget.captured);
    current = onlyTarget.to;
    path = [...path, onlyTarget.to];
    captures = [...captures, onlyTarget.captured];
  }
}

function squareToCoord(square: number) {
  const row = Math.floor((square - 1) / 5);
  const posInRow = (square - 1) % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
}

function getSquareCenterPct(square: number, flipped: boolean) {
  const { row, col } = squareToCoord(square);
  const viewRow = flipped ? 9 - row : row;
  const viewCol = flipped ? 9 - col : col;
  return { x: ((viewCol + 0.5) / 10) * 100, y: ((viewRow + 0.5) / 10) * 100 };
}

function extractFirstMoveToken(notation?: string | null): string {
  if (!notation) return "";
  const trimmed = notation.trim();
  if (!trimmed) return "";
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  return firstToken.replace(/^\d+\.(\.\.)?/, "");
}

function parseNotationPath(notation?: string | null): number[] {
  const moveToken = extractFirstMoveToken(notation);
  if (!moveToken) return [];
  const matches = moveToken.match(/\d+/g);
  if (!matches || matches.length < 2) return [];
  const from = Number(matches[0]);
  const to = Number(matches[1]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || from > 50 || to < 1 || to > 50) return [];
  return [from, to];
}

function renderBestMovePath(notation?: string | null, flipped = false) {
  const pathSquares = parseNotationPath(notation);
  if (pathSquares.length < 2) return null;

  const [fromSquare, toSquare] = pathSquares;
  const from = getSquareCenterPct(fromSquare, flipped);
  const to = getSquareCenterPct(toSquare, flipped);
  const linePoints = `${from.x},${from.y} ${to.x},${to.y}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={overlaySvgStyle}>
      <defs>
        <marker
          id="scan-bestmove-arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="5.1"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="rgba(79,118,186,0.64)" />
        </marker>
      </defs>
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgba(79,118,186,0.48)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.34}
      />
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgba(79,118,186,0.48)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#scan-bestmove-arrowhead)"
        opacity={0.92}
      />
    </svg>
  );
}

export default function AnalysisBoardCanvas({
  fen,
  mode,
  setupBrush,
  flipped = false,
  bestMoveNotation,
  showBoardFrame = true,
  onMovePlayed,
  onFenEdited,
  boardInteraction = "play",
  layerHighlights = [],
  layerArrows = [],
  onAnnotateHighlightClick,
  onAnnotateArrowClick,
  moveAnimationSeconds: moveAnimationSecondsProp,
  externalBoardOverlay,
}: Props) {
  const parsedBoard = useMemo(() => safelyParseFen(fen), [fen]);

  const [board, setBoard] = useState<BoardState>(parsedBoard);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [captureChain, setCaptureChain] = useState<CaptureChainState>(null);

  const syncLockedRef = useRef(false);
  const moveAnimCancelRef = useRef<(() => void) | null>(null);
  const moveAnimRef = useRef<
    (NotationAnimMetadata & { currentT: number }) | null
  >(null);
  const [moveAnimVersion, setMoveAnimVersion] = useState(0);

  const cancelMoveAnim = useCallback(() => {
    moveAnimCancelRef.current?.();
    moveAnimCancelRef.current = null;
    moveAnimRef.current = null;
    syncLockedRef.current = false;
    setMoveAnimVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    return () => cancelMoveAnim();
  }, [cancelMoveAnim]);

  useEffect(() => {
    if (syncLockedRef.current) return;
    cancelMoveAnim();
    setBoard(parsedBoard);
    setSelectedSquare(null);
    setCaptureChain(null);
  }, [parsedBoard, cancelMoveAnim]);

  const boardForDisplay = useMemo(() => {
    void moveAnimVersion;
    const anim = moveAnimRef.current;
    if (!anim) return board;
    return computeNotationAnimFrame(
      {
        fromBoard: anim.fromBoard,
        toBoard: anim.toBoard,
        path: anim.path,
        captures: anim.captures,
        movingPiece: anim.movingPiece,
        captureGhosts: anim.captureGhosts,
      },
      anim.currentT,
      flipped
    ).displayBoard;
  }, [board, flipped, moveAnimVersion]);

  const moveMotionOverlay = useMemo(() => {
    void moveAnimVersion;
    const anim = moveAnimRef.current;
    if (!anim) return null;
    return computeNotationAnimFrame(
      {
        fromBoard: anim.fromBoard,
        toBoard: anim.toBoard,
        path: anim.path,
        captures: anim.captures,
        movingPiece: anim.movingPiece,
        captureGhosts: anim.captureGhosts,
      },
      anim.currentT,
      flipped
    );
  }, [flipped, moveAnimVersion]);

  const moveAnimating = moveMotionOverlay != null;

  const legalTargets = useMemo<EngineTarget[]>(() => {
    if (moveAnimating) return [];
    if (mode !== "play") return [];
    if (captureChain) return getContinuationCaptureTargets(board, captureChain.current, captureChain.path, captureChain.captures);
    if (selectedSquare == null) return [];
    return getTargetsForSquare(board, selectedSquare);
  }, [board, mode, selectedSquare, captureChain, moveAnimating]);

  const secondsPerMove =
    moveAnimationSecondsProp ?? readStudioMoveAnimationSeconds();

  const finishAnimatedAutoMove = useCallback((event: BoardMoveSubmitEvent) => {
    moveAnimCancelRef.current = null;
    moveAnimRef.current = null;
    syncLockedRef.current = false;
    setMoveAnimVersion((n) => n + 1);
    setBoard(safelyParseFen(event.fenAfter));
    setSelectedSquare(null);
    setCaptureChain(null);
    onMovePlayed(event);
  }, [onMovePlayed]);

  const tryPlayAutoMoveWithOptionalAnimation = useCallback(
    (fromBoard: BoardState, event: BoardMoveSubmitEvent) => {
      const from = event.from;
      const path = event.path ?? [];
      if (from == null || path.length < 2) {
        setBoard(safelyParseFen(event.fenAfter));
        setSelectedSquare(null);
        setCaptureChain(null);
        onMovePlayed(event);
        return;
      }
      const em: EngineMove = {
        from,
        to: event.to ?? path[path.length - 1]!,
        path,
        captures: event.captures ?? [],
        side: event.side,
        notation: event.notation,
        fenAfter: event.fenAfter,
      };
      const meta = prepareNotationAnimFromEngineMove(fromBoard, em);
      if (!meta || secondsPerMove <= 0) {
        setBoard(safelyParseFen(event.fenAfter));
        setSelectedSquare(null);
        setCaptureChain(null);
        onMovePlayed(event);
        return;
      }
      cancelMoveAnim();
      syncLockedRef.current = true;
      moveAnimRef.current = { ...meta, currentT: 0 };
      setMoveAnimVersion((n) => n + 1);
      moveAnimCancelRef.current = runNotationMoveAnimation({
        meta,
        flipped,
        secondsPerMove,
        onFrame: (_frame, t) => {
          moveAnimRef.current = {
            fromBoard: meta.fromBoard,
            toBoard: meta.toBoard,
            path: meta.path,
            captures: meta.captures,
            movingPiece: meta.movingPiece,
            captureGhosts: meta.captureGhosts,
            currentT: t,
          };
          setMoveAnimVersion((n) => n + 1);
        },
        onComplete: () => finishAnimatedAutoMove(event),
      });
    },
    [cancelMoveAnim, finishAnimatedAutoMove, flipped, onMovePlayed, secondsPerMove]
  );

  const handlePlaySquare = (square: number) => {
    if (moveAnimating) return;
    const clickedPiece = board.squares[square];

    if (captureChain) {
      if (square === captureChain.current) return;
      const target = legalTargets.find((item) => item.to === square);
      if (!target || target.captured == null) return;

      const partialBoard = applyPartialCaptureStep(board, captureChain.current, target.to, target.captured);
      const nextPath = [...captureChain.path, target.to];
      const nextCaptures = [...captureChain.captures, target.captured];
      const continuationTargets = getContinuationCaptureTargets(partialBoard, target.to, nextPath, nextCaptures);

      if (continuationTargets.length > 0) {
        if (continuationTargets.length === 1 && continuationTargets[0].captured != null) {
          let autoBoard = partialBoard;
          let autoPath = [...nextPath];
          let autoCaptures = [...nextCaptures];
          let autoCurrent = target.to;
          let autoTargets = continuationTargets;

          while (autoTargets.length === 1 && autoTargets[0].captured != null) {
            const onlyTarget = autoTargets[0];
            const capSq = onlyTarget.captured;
            if (capSq == null) break;
            autoBoard = applyPartialCaptureStep(autoBoard, autoCurrent, onlyTarget.to, capSq);
            autoCurrent = onlyTarget.to;
            autoPath = [...autoPath, onlyTarget.to];
            autoCaptures = [...autoCaptures, capSq];
            autoTargets = getContinuationCaptureTargets(autoBoard, autoCurrent, autoPath, autoCaptures);
          }

          if (autoTargets.length === 0) {
            const result = applyCompleteCaptureMove(captureChain.startBoard, captureChain.origin, autoPath, autoCaptures, board.sideToMove);
            setBoard(safelyParseFen(result.fenAfter));
            setSelectedSquare(null);
            setCaptureChain(null);
            onMovePlayed({ notation: result.notation, from: result.from, to: result.to, path: result.path, captures: result.captures, side: result.side, fenAfter: result.fenAfter });
            return;
          }

          setBoard(autoBoard);
          setSelectedSquare(autoCurrent);
          setCaptureChain({ origin: captureChain.origin, current: autoCurrent, path: autoPath, captures: autoCaptures, startBoard: captureChain.startBoard });
          return;
        }

        setBoard(partialBoard);
        setSelectedSquare(target.to);
        setCaptureChain({ origin: captureChain.origin, current: target.to, path: nextPath, captures: nextCaptures, startBoard: captureChain.startBoard });
        return;
      }

      const result = applyCompleteCaptureMove(captureChain.startBoard, captureChain.origin, nextPath, nextCaptures, board.sideToMove);
      setBoard(safelyParseFen(result.fenAfter));
      setSelectedSquare(null);
      setCaptureChain(null);
      onMovePlayed({ notation: result.notation, from: result.from, to: result.to, path: result.path, captures: result.captures, side: result.side, fenAfter: result.fenAfter });
      return;
    }

    if (selectedSquare == null) {
      if (clickedPiece !== "empty" && isSelectableSourceSquare(board, square)) {
        const singleTargets = getTargetsForSquare(board, square);
        const autoMove = autoPlayForcedMoveChain(board, square, singleTargets);
        if (autoMove) {
          tryPlayAutoMoveWithOptionalAnimation(board, autoMove);
          return;
        }
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (clickedPiece !== "empty" && getPieceSide(clickedPiece) === board.sideToMove) {
      if (isSelectableSourceSquare(board, square)) {
        const singleTargets = getTargetsForSquare(board, square);
        const autoMove = autoPlayForcedMoveChain(board, square, singleTargets);
        if (autoMove) {
          tryPlayAutoMoveWithOptionalAnimation(board, autoMove);
          return;
        }
        setSelectedSquare(square);
      }
      return;
    }

    const target = legalTargets.find((item) => item.to === square);
    if (!target) return;

    if (target.isCapture && target.captured != null) {
      const partialBoard = applyPartialCaptureStep(board, selectedSquare, target.to, target.captured);
      const nextPath = [selectedSquare, target.to];
      const nextCaptures = [target.captured];
      const continuationTargets = getContinuationCaptureTargets(partialBoard, target.to, nextPath, nextCaptures);

      if (continuationTargets.length > 0) {
        setBoard(partialBoard);
        setSelectedSquare(target.to);
        setCaptureChain({ origin: selectedSquare, current: target.to, path: nextPath, captures: nextCaptures, startBoard: { ...board, squares: { ...board.squares } } });
        return;
      }

      const result = applyCompleteCaptureMove(board, selectedSquare, nextPath, nextCaptures, board.sideToMove);
      setBoard(safelyParseFen(result.fenAfter));
      setSelectedSquare(null);
      setCaptureChain(null);
      onMovePlayed({ notation: result.notation, from: result.from, to: result.to, path: result.path, captures: result.captures, side: result.side, fenAfter: result.fenAfter });
      return;
    }

    const result = applyEngineMove(board, { from: selectedSquare, to: target.to, path: [selectedSquare, target.to], captures: [], side: board.sideToMove });
    setBoard(safelyParseFen(result.fenAfter));
    setSelectedSquare(null);
    setCaptureChain(null);
    onMovePlayed({ notation: result.notation, from: result.from, to: result.to, path: result.path, captures: result.captures, side: result.side, fenAfter: result.fenAfter });
  };

  const boardSize = useMemo<8 | 10>(() => {
    const playableCount = getPlayableSquareCountFromBoard(parsedBoard);
    return inferBoardSizeFromPlayableSquares(playableCount);
  }, [parsedBoard]);

  const handleSquare = (
    square: number,
    options?: { dragPaint?: boolean; erase?: boolean }
  ) => {
    if (
      mode === "play" &&
      boardInteraction === "annotate-highlight" &&
      onAnnotateHighlightClick
    ) {
      onAnnotateHighlightClick(square);
      return;
    }
    if (mode === "play" && boardInteraction === "annotate-arrow" && onAnnotateArrowClick) {
      onAnnotateArrowClick(square);
      return;
    }
    if (mode === "setup") {
      if (options?.erase) {
        const nextBoard: BoardState = {
          ...board,
          squares: { ...board.squares, [square]: "empty" },
        };
        setBoard(nextBoard);
        setSelectedSquare(null);
        setCaptureChain(null);
        onFenEdited(boardStateToFen(nextBoard));
        return;
      }

      const currentPiece = board.squares[square];

      if (options?.dragPaint) {
        const nextPiece: PieceCode = setupBrush === "empty" ? "empty" : setupBrush;
        const nextBoard: BoardState = { ...board, squares: { ...board.squares, [square]: nextPiece } };
        setBoard(nextBoard);
        setSelectedSquare(null);
        setCaptureChain(null);
        onFenEdited(boardStateToFen(nextBoard));
        return;
      }

     const nextPiece: PieceCode =
        setupBrush === "empty"
            ? "empty"
            : currentPiece !== "empty"
            ? "empty"        // klik op stuk = verwijderen
            : setupBrush;    // klik op leeg = plaatsen
      const nextBoard: BoardState = { ...board, squares: { ...board.squares, [square]: nextPiece } };
      setBoard(nextBoard);
      setSelectedSquare(null);
      setCaptureChain(null);
      onFenEdited(boardStateToFen(nextBoard));
      return;
    }

    handlePlaySquare(square);
  };

  return (
    // Outer: flex column, fills whatever height the parent gives
    <div style={rootStyle}>

      {/* Board area: grows to fill available space, centers the board */}
      <div style={showBoardFrame ? boardShellStyle : boardShellBareStyle}>
        <div style={boardInnerStyle}>
          <BoardEditor
            board={boardForDisplay}
            currentBrush={setupBrush as PieceCode}
            onPaintSquare={handleSquare}
            selectedSquare={
              moveAnimating ? null : captureChain ? captureChain.current : selectedSquare
            }
            legalTargets={legalTargets}
            enableDragPaint={mode === "setup"}
            flipped={flipped}
          />
          {mode === "play" ? renderBestMovePath(bestMoveNotation, flipped) : null}
          {moveMotionOverlay ? (
            <NotationMoveAnimationOverlay
              flipped={flipped}
              ghostPos={moveMotionOverlay.ghostPos}
              movingPiece={moveMotionOverlay.movingPiece}
              captureGhosts={moveMotionOverlay.captureGhosts}
              captureOpacity={moveMotionOverlay.captureOpacity}
            />
          ) : null}
          {externalBoardOverlay}
          {layerHighlights.length > 0 || layerArrows.length > 0 ? (
            <BoardOverlayLayer
              boardSize={boardSize}
              highlights={layerHighlights}
              arrows={layerArrows}
              routes={[]}
            />
          ) : null}
        </div>
      </div>

    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  // Fill parent height entirely, lay out as a column
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  gap: 8,
  padding: 8,
  boxSizing: "border-box",
};

const boardShellStyle: CSSProperties = {
  // Grows to consume remaining vertical space after footer
  flex: "1 1 0",
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff",
  border: "1px solid #dbe3ec",
  borderRadius: 16,
  padding: 6,
  overflow: "hidden",
};

const boardShellBareStyle: CSSProperties = {
  ...boardShellStyle,
  background: "transparent",
  border: "none",
  borderRadius: 0,
  padding: 0,
};

const boardInnerStyle: CSSProperties = {
  // Height-driven square: takes the shell's height, width follows via aspect-ratio.
  // This way the board never overflows vertically and pushes the footer out.
  position: "relative",
  height: "100%",
  width: "auto",
  maxWidth: "100%",   // never wider than the shell
  aspectRatio: "1 / 1",
  lineHeight: 0,
  flex: "0 0 auto",
};

const overlaySvgStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "visible",
};
