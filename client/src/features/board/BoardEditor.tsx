import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardState, PieceCode } from "./boardTypes";

type HighlightTarget = {
  to: number;
  isCapture: boolean;
};

type Props = {
  board: BoardState;
  currentBrush: PieceCode;
  onPaintSquare: (
    square: number,
    options?: { dragPaint?: boolean; erase?: boolean }
  ) => void;
  selectedSquare?: number | null;
  legalTargets?: HighlightTarget[];
  enableDragPaint?: boolean;
  flipped?: boolean;
  onSquarePointerDown?: (square: number, button: number) => void;
  onSquarePointerHover?: (square: number, buttons: number) => void;
  onSquarePointerUp?: (square: number, button: number) => void;
};

const isDarkSquare = (row: number, col: number) => (row + col) % 2 === 1;

const getPlayableSquareNumber = (row: number, col: number): number | null => {
  if (!isDarkSquare(row, col)) return null;
  return row * 5 + Math.floor(col / 2) + 1;
};

const getPieceVisual = (piece: PieceCode) => {
  switch (piece) {
    case "wm":
      return {
        background:
          "var(--piece-white-bg, radial-gradient(circle at 30% 30%, #ffffff, #d9d9d9 70%, #b8b8b8 100%))",
        border: "2px solid var(--piece-white-border, #9a9a9a)",
        label: "",
        labelColor: "#222",
      };
    case "wk":
      return {
        background:
          "var(--piece-white-bg, radial-gradient(circle at 30% 30%, #ffffff, #d9d9d9 70%, #b8b8b8 100%))",
        border: "2px solid var(--piece-white-border, #9a9a9a)",
        label: "★",
        labelColor: "#222",
      };
    case "bm":
      return {
        background:
          "var(--piece-black-bg, radial-gradient(circle at 30% 30%, #666666, #2f2f2f 70%, #141414 100%))",
        border: "2px solid var(--piece-black-border, #0f0f0f)",
        label: "",
        labelColor: "#f2f2f2",
      };
    case "bk":
      return {
        background:
          "var(--piece-black-bg, radial-gradient(circle at 30% 30%, #666666, #2f2f2f 70%, #141414 100%))",
        border: "2px solid var(--piece-black-border, #0f0f0f)",
        label: "★",
        labelColor: "#f2f2f2",
      };
    default:
      return null;
  }
};

export default function BoardEditor({
  board,
  currentBrush: _currentBrush,
  onPaintSquare,
  selectedSquare,
  legalTargets = [],
  enableDragPaint = false,
  flipped = false,
  onSquarePointerDown,
  onSquarePointerHover,
  onSquarePointerUp,
}: Props) {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [lastDraggedSquare, setLastDraggedSquare] = useState<number | null>(null);
  const didDragRef = useRef(false);
  const isRightEraseDragRef = useRef(false);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      setIsMouseDown(false);
      setLastDraggedSquare(null);
      isRightEraseDragRef.current = false;
      // Defer clearing didDragRef until after the synthetic click event for this
      // gesture. Otherwise window mouseup runs before click; click would not see
      // didDragRef=true and would fire a second onPaintSquare (setup mode toggles
      // the square and removes the piece just placed via mousedown drag-paint).
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, []);

  const targetMap = useMemo(
    () => new Map(legalTargets.map((t) => [t.to, t])),
    [legalTargets]
  );

  const handleSingleClick = (square: number | null) => {
    if (square === null) return;

    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    onPaintSquare(square, { dragPaint: false });
  };

  const handleDragStart = (square: number | null) => {
    if (!enableDragPaint || square === null) return;

    setIsMouseDown(true);
    setLastDraggedSquare(square);
    didDragRef.current = true;

    onPaintSquare(square, { dragPaint: true });
  };

  const handleDragEnter = (square: number | null, buttons: number) => {
    if (!enableDragPaint || square === null) return;

    if (isRightEraseDragRef.current && (buttons & 2)) {
      onPaintSquare(square, { erase: true });
      return;
    }

    if (!isMouseDown) return;
    if (lastDraggedSquare === square) return;

    if (!didDragRef.current && lastDraggedSquare !== null) {
      didDragRef.current = true;
      onPaintSquare(lastDraggedSquare, { dragPaint: true });
    }

    setLastDraggedSquare(square);
    onPaintSquare(square, { dragPaint: true });
  };

  const handleMouseDown = (square: number | null, button: number) => {
    if (button === 2) {
      if (!enableDragPaint || square === null) return;
      isRightEraseDragRef.current = true;
      onPaintSquare(square, { erase: true });
      return;
    }
    handleDragStart(square);
  };

  return (
    <div
      style={{ userSelect: "none", width: "100%", height: "100%" }}
      onMouseLeave={() => {
        if (enableDragPaint) {
          setIsMouseDown(false);
          setLastDraggedSquare(null);
        }
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gridTemplateRows: "repeat(10, 1fr)",
          width: "100%",
          height: "100%",
          border: "3px solid var(--board-border, #4b3425)",
          boxShadow: "var(--board-shadow, 0 10px 24px rgba(0,0,0,0.18))",
        }}
      >
        {Array.from({ length: 10 }).map((_, row) =>
          Array.from({ length: 10 }).map((__, col) => {
            const viewRow = flipped ? 9 - row : row;
            const viewCol = flipped ? 9 - col : col;
            const playableSquare = getPlayableSquareNumber(viewRow, viewCol);
            const dark = isDarkSquare(row, col);
            const piece =
              playableSquare !== null ? board.squares[playableSquare] : "empty";
            const visual = getPieceVisual(piece);

            const isSelected =
              playableSquare !== null && selectedSquare === playableSquare;

            const target =
              playableSquare !== null ? targetMap.get(playableSquare) : undefined;

            return (
              <button
                key={`${row}-${col}`}
                type="button"
                onClick={() => handleSingleClick(playableSquare)}
                onMouseDown={(e) => {
                  if (e.button === 2) {
                    e.preventDefault();
                  }
                  if (playableSquare !== null) {
                    onSquarePointerDown?.(playableSquare, e.button);
                  }
                  handleMouseDown(playableSquare, e.button);
                }}
                onMouseEnter={(e) => {
                  if (playableSquare !== null) {
                    onSquarePointerHover?.(playableSquare, e.buttons);
                  }
                  handleDragEnter(playableSquare, e.buttons);
                }}
                onContextMenu={(e) => {
                  if (enableDragPaint && dark && playableSquare !== null) {
                    e.preventDefault();
                  }
                }}
                onMouseUp={(e) => {
                  if (playableSquare !== null) {
                    onSquarePointerUp?.(playableSquare, e.button);
                  }
                  if (enableDragPaint) {
                    setIsMouseDown(false);
                    setLastDraggedSquare(null);
                  }
                }}
                disabled={!dark}
                style={{
                  width: "100%",
                  height: "100%",
                  border: isSelected
                    ? "3px solid #2b7fff"
                    : target?.isCapture
                    ? "3px solid #ff9f1a"
                    : target
                    ? "3px solid #67a6ff"
                    : "1px solid var(--board-square-border, #6f5847)",
                  background: dark
                    ? "var(--board-dark-square, linear-gradient(135deg, #8b6a4f 0%, #6f4f37 100%))"
                    : "var(--board-light-square, #ead7bf)",
                  cursor: dark ? "pointer" : "default",
                  padding: 0,
                  position: "relative",
                  boxSizing: "border-box",
                  aspectRatio: "1 / 1",
                }}
                title={
                  playableSquare
                    ? enableDragPaint
                      ? `Square ${playableSquare} · rechtsklik of rechts slepen = wissen`
                      : `Square ${playableSquare}`
                    : ""
                }
              >
                {playableSquare !== null && target && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        width: "18%",
                        height: "18%",
                        borderRadius: "50%",
                        background: target.isCapture
                          ? "rgba(255,159,26,0.95)"
                          : "rgba(103,166,255,0.9)",
                        boxShadow: "0 0 0 3px rgba(255,255,255,0.35)",
                      }}
                    />
                  </div>
                )}

                {playableSquare !== null && visual && (
                  <div
                    style={{
                      width: "70%",
                      height: "70%",
                      borderRadius: "50%",
                      background: visual.background,
                      border: visual.border,
                      margin: "0 auto",
                      boxShadow:
                        "inset 0 2px 4px rgba(255,255,255,0.35), 0 3px 6px rgba(0,0,0,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.05rem",
                      lineHeight: 1,
                      fontWeight: 800,
                      color: visual.labelColor,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {visual.label}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}