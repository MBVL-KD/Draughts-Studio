import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import type { LessonStep } from "../types/stepTypes";

const isDarkSquare = (row: number, col: number) => (row + col) % 2 === 1;

function getPlayableSquareNumber(row: number, col: number): number | null {
  if (!isDarkSquare(row, col)) return null;
  return row * 5 + Math.floor(col / 2) + 1;
}

/** Center of the playable cell for `square`, in % of the 10×10 board (matches BoardEditor flip). */
export function squareToBoardPercentCenter(square: number, flipped: boolean): {
  leftPct: number;
  topPct: number;
} {
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const dark = isDarkSquare(row, col);
      if (!dark) continue;
      const viewRow = flipped ? 9 - row : row;
      const viewCol = flipped ? 9 - col : col;
      const playable = getPlayableSquareNumber(viewRow, viewCol);
      if (playable === square) {
        return { leftPct: (col + 0.5) * 10, topPct: (row + 0.5) * 10 };
      }
    }
  }
  return { leftPct: 50, topPct: 50 };
}

export function easeInOutQuad(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

export function pointAlongSquarePath(
  path: number[],
  u: number,
  flipped: boolean
): { leftPct: number; topPct: number } {
  if (path.length === 0) return { leftPct: 50, topPct: 50 };
  if (path.length === 1) return squareToBoardPercentCenter(path[0]!, flipped);
  const segments = path.length - 1;
  const uu = Math.min(1, Math.max(0, u)) * segments;
  const seg = Math.min(segments - 1, Math.floor(uu));
  const local = uu - seg;
  const a = squareToBoardPercentCenter(path[seg]!, flipped);
  const b = squareToBoardPercentCenter(path[seg + 1]!, flipped);
  return {
    leftPct: a.leftPct + (b.leftPct - a.leftPct) * local,
    topPct: a.topPct + (b.topPct - a.topPct) * local,
  };
}

export function getReplayMoveNotation(step: LessonStep, toBoardIndex: number): string | null {
  if (toBoardIndex < 1) return null;
  const timeline = step.sourceRef?.nodeTimeline ?? [];
  const snap = timeline[toBoardIndex - 1];
  if (snap?.notation && String(snap.notation).trim()) {
    return String(snap.notation).trim();
  }
  const ap = step.presentation?.autoplay?.moves ?? [];
  const m = ap[toBoardIndex - 1];
  if (m != null && String(m).trim()) return String(m).trim();
  return null;
}

export function pieceVisualForReplay(piece: PieceCode): {
  background: string;
  border: string;
  label: string;
  labelColor: string;
} {
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
      return {
        background: "transparent",
        border: "none",
        label: "",
        labelColor: "#222",
      };
  }
}

export type CaptureGhost = { square: number; piece: PieceCode };

export function captureGhostsFromMove(
  fromBoard: BoardState,
  captureSquares: number[]
): CaptureGhost[] {
  return captureSquares
    .map((square) => {
      const piece = fromBoard.squares[square];
      if (piece === "empty") return null;
      return { square, piece } as CaptureGhost;
    })
    .filter((v): v is CaptureGhost => v !== null);
}
