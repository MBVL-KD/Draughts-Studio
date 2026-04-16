import { fenToBoardState } from "../../features/board/fenUtils";
import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import {
  cloneBoard,
  type EngineMove,
} from "../source-editor/sourceBoardEngine";
import {
  captureGhostsFromMove,
  easeInOutQuad,
  pointAlongSquarePath,
  type CaptureGhost,
} from "./previewReplayAnimation";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";

export const STUDIO_MOVE_ANIM_STORAGE_KEY = "studio.replayMoveSecondsPerStep";

const SLIDE_PHASE = 0.68;

export function readStudioMoveAnimationSeconds(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STUDIO_MOVE_ANIM_STORAGE_KEY);
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(2, v));
}

export type NotationAnimMetadata = {
  fromBoard: BoardState;
  toBoard: BoardState;
  path: number[];
  captures: number[];
  movingPiece: PieceCode;
  captureGhosts: CaptureGhost[];
};

export type NotationAnimFrame = {
  displayBoard: BoardState;
  ghostPos: { leftPct: number; topPct: number } | null;
  movingPiece: PieceCode;
  captureGhosts: CaptureGhost[];
  captureOpacity: number;
};

export function prepareNotationAnimFromEngineMove(
  fromBoard: BoardState,
  em: EngineMove
): NotationAnimMetadata | null {
  const fromSq = em.path[0];
  if (fromSq == null || em.path.length < 2) return null;
  const movingPiece = fromBoard.squares[fromSq];
  if (movingPiece === "empty") return null;
  let toBoard: BoardState;
  try {
    toBoard = fenToBoardState(em.fenAfter);
  } catch {
    return null;
  }
  return {
    fromBoard,
    toBoard,
    path: em.path,
    captures: em.captures,
    movingPiece,
    captureGhosts: captureGhostsFromMove(fromBoard, em.captures),
  };
}

export function prepareNotationAnimFromNotation(
  fromBoard: BoardState,
  notation: string
): NotationAnimMetadata | null {
  const em = resolveNotationToEngineMove(fromBoard, notation.trim());
  if (!em) return null;
  return prepareNotationAnimFromEngineMove(fromBoard, em);
}

export function computeNotationAnimFrame(
  meta: NotationAnimMetadata,
  currentT: number,
  flipped: boolean
): NotationAnimFrame {
  const segments = Math.max(1, meta.path.length - 1);
  /** Multi-hop captures: equal wall-clock per hop (linear along full path). Simple moves: eased. */
  const multiHop = segments > 1;
  const tSlide = multiHop ? currentT : easeInOutQuad(currentT);
  const base = cloneBoard(meta.fromBoard);
  base.squares[meta.path[0]!] = "empty";
  const displayBoard = tSlide < SLIDE_PHASE ? base : cloneBoard(meta.toBoard);
  const captureFade =
    tSlide >= SLIDE_PHASE
      ? Math.min(1, (tSlide - SLIDE_PHASE) / Math.max(0.05, 1 - SLIDE_PHASE))
      : 0;
  const slideU = Math.min(1, tSlide / SLIDE_PHASE);
  const ghostPos =
    tSlide < SLIDE_PHASE ? pointAlongSquarePath(meta.path, slideU, flipped) : null;
  const captureOpacity = tSlide >= SLIDE_PHASE ? Math.max(0, 1 - captureFade) : 0;
  return {
    displayBoard,
    ghostPos,
    movingPiece: meta.movingPiece,
    captureGhosts: meta.captureGhosts,
    captureOpacity,
  };
}

export type RunNotationMoveAnimationOptions = {
  meta: NotationAnimMetadata;
  flipped: boolean;
  secondsPerMove: number;
  /** `t` is linear progress in [0, 1] for this ply (eased sampling is internal to `computeNotationAnimFrame`). */
  onFrame: (frame: NotationAnimFrame, t: number) => void;
  onComplete: () => void;
};

/**
 * Animates one resolved engine-style move. When `secondsPerMove` is 0, skips frames and calls `onComplete` on a microtask.
 */
export function runNotationMoveAnimation(options: RunNotationMoveAnimationOptions): () => void {
  const { meta, flipped, secondsPerMove, onFrame, onComplete } = options;
  if (secondsPerMove <= 0) {
    queueMicrotask(onComplete);
    return () => {};
  }

  const segmentCount = Math.max(1, meta.path.length - 1);
  const durationMs = Math.max(120, secondsPerMove * 1000 * segmentCount);
  let raf = 0;
  let cancelled = false;
  const startedAt = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startedAt) / durationMs);
    onFrame(computeNotationAnimFrame(meta, t, flipped), t);
    if (t >= 1) {
      onComplete();
      return;
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (raf) window.cancelAnimationFrame(raf);
  };
}
