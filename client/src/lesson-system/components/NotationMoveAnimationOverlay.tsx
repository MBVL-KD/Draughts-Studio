import type { CSSProperties } from "react";
import type { PieceCode } from "../../features/board/boardTypes";
import {
  pieceVisualForReplay,
  squareToBoardPercentCenter,
  type CaptureGhost,
} from "../utils/previewReplayAnimation";

export type NotationMotionOverlayProps = {
  flipped: boolean;
  ghostPos: { leftPct: number; topPct: number } | null;
  movingPiece: PieceCode;
  captureGhosts: CaptureGhost[];
  captureOpacity: number;
};

export default function NotationMoveAnimationOverlay({
  flipped,
  ghostPos,
  movingPiece,
  captureGhosts,
  captureOpacity,
}: NotationMotionOverlayProps) {
  return (
    <>
      {captureGhosts.length > 0 && captureOpacity > 0
        ? captureGhosts.map((cg) => {
            const c = squareToBoardPercentCenter(cg.square, flipped);
            const vis = pieceVisualForReplay(cg.piece);
            return (
              <div
                key={`cap-ghost-${cg.square}`}
                style={{
                  ...ghostBaseStyle,
                  left: `${c.leftPct}%`,
                  top: `${c.topPct}%`,
                  width: "10.5%",
                  height: "10.5%",
                  background: vis.background,
                  border: vis.border,
                  opacity: captureOpacity,
                  zIndex: 6,
                }}
              />
            );
          })
        : null}
      {ghostPos ? (
        (() => {
          const vis = pieceVisualForReplay(movingPiece);
          const g = ghostPos;
          return (
            <div
              style={{
                ...ghostBaseStyle,
                left: `${g.leftPct}%`,
                top: `${g.topPct}%`,
                width: "12%",
                height: "12%",
                background: vis.background,
                border: vis.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                fontWeight: 800,
                color: vis.labelColor,
                zIndex: 7,
                boxShadow:
                  "inset 0 2px 4px rgba(255,255,255,0.35), 0 4px 10px rgba(0,0,0,0.35)",
              }}
            >
              {vis.label}
            </div>
          );
        })()
      ) : null}
    </>
  );
}

const ghostBaseStyle: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  pointerEvents: "none",
  boxShadow: "inset 0 2px 4px rgba(255,255,255,0.35), 0 3px 6px rgba(0,0,0,0.25)",
  transition: "opacity 40ms linear",
};
