import type { CSSProperties, ReactNode } from "react";
import type { PieceCode, SideToMove } from "../../types/presentationTypes";

type Props = {
  selectedTool: PieceCode | "eraser";
  sideToMove: SideToMove;
  onSelectTool: (tool: PieceCode | "eraser") => void;
  onSetSideToMove: (side: SideToMove) => void;
  onClearBoard: () => void;
  onResetBoard: () => void;
};

export default function PaintToolbar({
  selectedTool,
  sideToMove,
  onSelectTool,
  onSetSideToMove,
  onClearBoard,
  onResetBoard,
}: Props) {
  return (
    <div style={barStyle}>
      <PieceToolButton
        title="White man"
        active={selectedTool === "wm"}
        onClick={() => onSelectTool("wm")}
        piece={<PieceGlyph piece="wm" />}
      />

      <PieceToolButton
        title="White king"
        active={selectedTool === "wk"}
        onClick={() => onSelectTool("wk")}
        piece={<PieceGlyph piece="wk" />}
      />

      <PieceToolButton
        title="Black man"
        active={selectedTool === "bm"}
        onClick={() => onSelectTool("bm")}
        piece={<PieceGlyph piece="bm" />}
      />

      <PieceToolButton
        title="Black king"
        active={selectedTool === "bk"}
        onClick={() => onSelectTool("bk")}
        piece={<PieceGlyph piece="bk" />}
      />

      <ToolButton
        label="⌫"
        title="Eraser"
        active={selectedTool === "eraser"}
        onClick={() => onSelectTool("eraser")}
      />

      <ToolButton
        label="Clear"
        title="Clear board"
        active={false}
        onClick={onClearBoard}
        small
      />

      <ToolButton
        label="Start"
        title="Reset to initial position"
        active={false}
        onClick={onResetBoard}
        small
      />

      <ToolButton
        label="W move"
        title="White to move"
        active={sideToMove === "white"}
        onClick={() => onSetSideToMove("white")}
        small
      />

      <ToolButton
        label="B move"
        title="Black to move"
        active={sideToMove === "black"}
        onClick={() => onSetSideToMove("black")}
        small
      />
    </div>
  );
}

/* =========================
   BUTTONS
========================= */

function PieceToolButton({
  title,
  active,
  onClick,
  piece,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  piece: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        ...pieceButtonStyle,
        ...(active ? activeStyle : null),
      }}
    >
      {piece}
    </button>
  );
}

function ToolButton({
  label,
  title,
  active,
  onClick,
  small = false,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        ...buttonStyle,
        ...(small ? smallButtonStyle : null),
        ...(active ? activeStyle : null),
        color: "#111827",
        WebkitTextFillColor: "#111827",
      }}
    >
      {label}
    </button>
  );
}

/* =========================
   PIECE RENDERING
========================= */

function PieceGlyph({ piece }: { piece: PieceCode }) {
  const isWhite = piece === "wm" || piece === "wk";
  const isKing = piece === "wk" || piece === "bk";

  return (
    <div style={pieceOuterStyle}>
      <div
        style={{
          ...pieceDiscStyle,
          background: isWhite
            ? "radial-gradient(circle at 32% 28%, #ffffff 0%, #f1f5f9 50%, #dbe4ee 100%)"
            : "radial-gradient(circle at 32% 28%, #4b5563 0%, #1f2937 50%, #030712 100%)",
          border: isWhite ? "2px solid #94a3b8" : "2px solid #0f172a",
          boxShadow: isWhite
            ? "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(15,23,42,0.16)"
            : "inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(15,23,42,0.30)",
        }}
      >
        <div
          style={{
            ...pieceInnerRingStyle,
            border: isWhite
              ? "2px solid rgba(148,163,184,0.95)"
              : "2px solid rgba(255,255,255,0.22)",
          }}
        />

        {isKing && (
          <div
            style={{
              ...kingMarkStyle,
              color: isWhite ? "#111827" : "#ffffff",
              WebkitTextFillColor: isWhite ? "#111827" : "#ffffff",
            }}
          >
            ★
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================
   STYLES
========================= */

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const buttonStyle: CSSProperties = {
  minWidth: 44,
  height: 38,
  borderRadius: 10,
  border: "1px solid #c7c7c7",
  background: "#fff",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
};

const pieceButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid #c7c7c7",
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
};

const smallButtonStyle: CSSProperties = {
  minWidth: 56,
  height: 38,
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
};

const activeStyle: CSSProperties = {
  border: "2px solid #2b7fff",
  background: "#eef5ff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
};

const pieceOuterStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
};

const pieceDiscStyle: CSSProperties = {
  position: "relative",
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
};

const pieceInnerRingStyle: CSSProperties = {
  position: "absolute",
  inset: 5,
  borderRadius: "50%",
};

const kingMarkStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1,
};