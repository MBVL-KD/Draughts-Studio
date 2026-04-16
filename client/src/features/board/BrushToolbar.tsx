import { useState } from "react";
import type { PieceCode, SideToMove } from "./boardTypes";

type Props = {
  currentBrush: PieceCode;
  onBrushChange: (brush: PieceCode) => void;
  sideToMove: SideToMove;
  onSideToMoveChange: (side: SideToMove) => void;
  onClearBoard: () => void;
  onLoadFen: (fen: string) => void;
  onLoadStartPosition: () => void;
  onNewPuzzle: () => void;
};

const buttonBase: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 12,
  border: "1px solid #c7c7c7",
  background: "#ffffff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center", 
  justifyContent: "center",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  color: "#111",
};

const activeButton: React.CSSProperties = {
  ...buttonBase,
  border: "2px solid #2b7fff",
  background: "#eef5ff",
};

const sideButton: React.CSSProperties = {
  ...buttonBase,
  width: 42,
  fontWeight: 700,
  fontSize: 14,
};

function PieceGlyph({
  kind,
}: {
  kind: "wm" | "wk" | "bm" | "bk";
}) {
  const isWhite = kind === "wm" || kind === "wk";
  const isKing = kind === "wk" || kind === "bk";

  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: isWhite
          ? "radial-gradient(circle at 30% 30%, #ffffff, #d9d9d9 70%, #b8b8b8 100%)"
          : "radial-gradient(circle at 30% 30%, #666666, #2f2f2f 70%, #141414 100%)",
        border: isWhite ? "2px solid #9a9a9a" : "2px solid #111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        color: isWhite ? "#222" : "#f2f2f2",
        lineHeight: 1,
      }}
    >
      {isKing ? "★" : ""}
    </div>
  );
}

function IconButton({
  active = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={active ? activeButton : buttonBase}
    >
      {children}
    </button>
  );
}

export default function BrushToolbar({
  currentBrush,
  onBrushChange,
  sideToMove,
  onSideToMoveChange,
  onClearBoard,
  onLoadFen,
  onLoadStartPosition,
  onNewPuzzle,
}: Props) {
  const [fenInput, setFenInput] = useState("");
  const [fenStatus, setFenStatus] = useState("");

  const handleLoadFen = () => {
    try {
      onLoadFen(fenInput);
      setFenStatus("FEN loaded ✅");
    } catch (error) {
      console.error(error);
      setFenStatus("Invalid FEN ❌");
    }
  };

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 16,
        padding: 14,
        background: "#ffffff",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <IconButton
          title="White Man"
          active={currentBrush === "wm"}
          onClick={() => onBrushChange("wm")}
        >
          <PieceGlyph kind="wm" />
        </IconButton>

        <IconButton
          title="White King"
          active={currentBrush === "wk"}
          onClick={() => onBrushChange("wk")}
        >
          <PieceGlyph kind="wk" />
        </IconButton>

        <IconButton
          title="Black Man"
          active={currentBrush === "bm"}
          onClick={() => onBrushChange("bm")}
        >
          <PieceGlyph kind="bm" />
        </IconButton>

        <IconButton
          title="Black King"
          active={currentBrush === "bk"}
          onClick={() => onBrushChange("bk")}
        >
          <PieceGlyph kind="bk" />
        </IconButton>

        <IconButton
          title="Eraser"
          active={currentBrush === "empty"}
          onClick={() => onBrushChange("empty")}
        >
          <span style={{ fontSize: 18, fontWeight: 700 }}>⌫</span>
        </IconButton>

        <div
          style={{
            width: 1,
            height: 30,
            background: "#ddd",
            margin: "0 4px",
          }}
        />

        <button
          type="button"
          title="White to move"
          onClick={() => onSideToMoveChange("W")}
          style={
            sideToMove === "W"
              ? { ...sideButton, border: "2px solid #2b7fff", background: "#eef5ff" }
              : sideButton
          }
        >
          W
        </button>

        <button
          type="button"
          title="Black to move"
          onClick={() => onSideToMoveChange("B")}
          style={
            sideToMove === "B"
              ? { ...sideButton, border: "2px solid #2b7fff", background: "#eef5ff" }
              : sideButton
          }
        >
          B
        </button>

        <div
          style={{
            width: 1,
            height: 30,
            background: "#ddd",
            margin: "0 4px",
          }}
        />

        <IconButton title="Clear Board" onClick={onClearBoard}>
          <span style={{ fontSize: 18 }}>🧹</span>
        </IconButton>

        <IconButton title="Load Start Position" onClick={onLoadStartPosition}>
          <span style={{ fontSize: 18 }}>♟</span>
        </IconButton>

        <IconButton title="New Puzzle" onClick={onNewPuzzle}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>＋</span>
        </IconButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "start",
        }}
      >
        <textarea
          value={fenInput}
          onChange={(e) => setFenInput(e.target.value)}
          placeholder="Import FEN: W:W31,32,K33:B1,2,K5"
          rows={2}
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid #d6d6d6",
            padding: 10,
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <button
          type="button"
          onClick={handleLoadFen}
          title="Load FEN"
          style={{
            ...buttonBase,
            width: 46,
            height: 46,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          ⤓
        </button>
      </div>

      <div style={{ fontSize: 13, color: "#555", minHeight: 18 }}>{fenStatus}</div>
    </div>
  );
}