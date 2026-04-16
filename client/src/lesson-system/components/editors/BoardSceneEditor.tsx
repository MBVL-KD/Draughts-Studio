import type { CSSProperties } from "react";
import type {
  ArrowSpec,
  HighlightSpec,
  PieceCode,
  RouteSpec,
} from "../../types/presentationTypes";
import { rowColToSquare, squareToRowCol } from "../../utils/boardSquares";

type Props = {
  piecesBySquare: Record<number, PieceCode>;
  highlights: HighlightSpec[];
  arrows: ArrowSpec[];
  routes: RouteSpec[];
  onSquareClick: (square: number) => void;
};

const boardPx = 520;
const cell = boardPx / 10;

export default function BoardSceneEditor({
  piecesBySquare,
  highlights,
  arrows,
  routes,
  onSquareClick,
}: Props) {
  return (
    <div style={boardWrapStyle}>
      <div style={boardGridStyle}>
        {Array.from({ length: 100 }).map((_, i) => {
          const row = Math.floor(i / 10);
          const col = i % 10;
          const square = rowColToSquare(row, col);
          const isDark = (row + col) % 2 === 1;
          const piece = square ? piecesBySquare[square] ?? "empty" : "empty";

          return (
            <button
              key={`${row}-${col}`}
              type="button"
              onClick={() => square && onSquareClick(square)}
              style={{
                ...squareStyle,
                background: isDark ? "#7a5737" : "#e7d9bb",
                cursor: square ? "pointer" : "default",
              }}
            >
              {square ? <div style={squareNoStyle}>{square}</div> : null}
              {square ? renderHighlight(square, highlights) : null}
              {square && piece !== "empty" ? (
                <div style={pieceWrapStyle}>{renderPiece(piece)}</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <svg
        width={boardPx}
        height={boardPx}
        viewBox={`0 0 ${boardPx} ${boardPx}`}
        style={svgStyle}
      >
        <defs>
          {(["primary", "success", "warning", "danger", "info"] as const).map((color) => (
            <marker
              key={color}
              id={`arrowHeadEditor-${color}`}
              markerWidth="12"
              markerHeight="12"
              refX="8"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 8 4, 0 8" fill={solidColorOf(color)} />
            </marker>
          ))}
        </defs>

        {routes
          .filter((route) => Array.isArray(route.squares) && route.squares.length >= 1)
          .map((route) => renderRoute(route))}

        {arrows
          .filter((arrow) => typeof arrow.from === "number" && typeof arrow.to === "number")
          .map((arrow) => renderArrow(arrow))}
      </svg>
    </div>
  );
}

function renderHighlight(square: number, highlights: HighlightSpec[]) {
  const squareHighlights = highlights.filter(
    (h) => Array.isArray(h.squares) && h.squares.includes(square)
  );

  if (squareHighlights.length === 0) return null;

  return squareHighlights.map((h) => (
    <div
      key={h.id}
      style={{
        ...highlightStyle,
        background: h.fill ? colorOf(h.color, 0.28) : "transparent",
        border:
          h.outline === false ? "none" : `3px solid ${colorOf(h.color, 0.95)}`,
        boxShadow: h.pulse ? `0 0 0 3px ${colorOf(h.color, 0.2)}` : undefined,
      }}
    />
  ));
}

function renderArrow(arrow: ArrowSpec) {
  const [x1, y1] = toCenterParts(arrow.from!);
  const [x2, y2] = toCenterParts(arrow.to!);
  const stroke = colorOf(arrow.color, 0.95);
  const marker = `url(#arrowHeadEditor-${arrow.color ?? "success"})`;

  if (arrow.curved) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const nx = -dy;
    const ny = dx;
    const norm = Math.sqrt(nx * nx + ny * ny) || 1;
    const curveAmount = 28;
    const cx = mx + (nx / norm) * curveAmount;
    const cy = my + (ny / norm) * curveAmount;

    return (
      <g key={arrow.id}>
        <path
          d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={arrow.dashed ? "12 8" : undefined}
          markerEnd={marker}
        />
        {arrow.label ? renderSvgLabel(x2, y2, arrow.label, stroke) : null}
      </g>
    );
  }

  return (
    <g key={arrow.id}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={arrow.dashed ? "12 8" : undefined}
        markerEnd={marker}
      />
      {arrow.label ? renderSvgLabel(x2, y2, arrow.label, stroke) : null}
    </g>
  );
}

function renderRoute(route: RouteSpec) {
  const points = (route.squares ?? []).map((sq) => toCenter(sq));
  if (points.length === 0) return null;

  const stroke = colorOf(route.color, 0.95);
  const pathPoints =
    route.closed && points.length >= 3 ? [...points, points[0]] : points;

  return (
    <g key={route.id}>
      {pathPoints.length >= 2 ? (
        <polyline
          points={pathPoints.join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={route.dashed ? "12 8" : undefined}
        />
      ) : null}

      {(route.squares ?? []).map((sq, index) => {
        const [x, y] = toCenterParts(sq);
        return (
          <circle
            key={`${route.id}-${sq}-${index}`}
            cx={x}
            cy={y}
            r={5}
            fill={solidColorOf(route.color)}
          />
        );
      })}

      {route.label && route.squares && route.squares.length > 0
        ? (() => {
            const last = route.squares[route.squares.length - 1];
            const [x, y] = toCenterParts(last);
            return renderSvgLabel(x, y, route.label, stroke);
          })()
        : null}
    </g>
  );
}

function renderSvgLabel(x: number, y: number, label: string, color: string) {
  return (
    <g>
      <rect
        x={x + 10}
        y={y - 28}
        rx={8}
        ry={8}
        width={Math.max(36, label.length * 9)}
        height={24}
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <text
        x={x + 18}
        y={y - 12}
        fontSize="14"
        fontWeight="700"
        fill={color}
      >
        {label}
      </text>
    </g>
  );
}

function renderPiece(piece: PieceCode) {
  const isWhite = piece === "wm" || piece === "wk";
  const isKing = piece === "wk" || piece === "bk";

  return (
    <div
      style={{
        ...pieceStyle,
        background: isWhite ? "#f8fafc" : "#1f2937",
        border: isWhite ? "2px solid #cbd5e1" : "2px solid #111827",
      }}
    >
      {isKing ? (
        <div
          style={{
            fontSize: 16,
            fontWeight: 900,
            lineHeight: 1,
            color: isWhite ? "#111827" : "#f9fafb",
            WebkitTextFillColor: isWhite ? "#111827" : "#f9fafb",
          }}
        >
          ★
        </div>
      ) : null}
    </div>
  );
}

function toCenter(square: number) {
  const [x, y] = toCenterParts(square);
  return `${x},${y}`;
}

function toCenterParts(square: number): [number, number] {
  const { row, col } = squareToRowCol(square);
  return [col * cell + cell / 2, row * cell + cell / 2];
}

function solidColorOf(color: string) {
  switch (color) {
    case "primary":
      return "#4f46e5";
    case "success":
      return "#16a34a";
    case "warning":
      return "#f59e0b";
    case "danger":
      return "#dc2626";
    case "info":
      return "#0ea5e9";
    default:
      return "#4f46e5";
  }
}

function colorOf(color: string, alpha: number) {
  switch (color) {
    case "primary":
      return `rgba(79,70,229,${alpha})`;
    case "success":
      return `rgba(22,163,74,${alpha})`;
    case "warning":
      return `rgba(245,158,11,${alpha})`;
    case "danger":
      return `rgba(220,38,38,${alpha})`;
    case "info":
      return `rgba(14,165,233,${alpha})`;
    default:
      return `rgba(79,70,229,${alpha})`;
  }
}

const boardWrapStyle: CSSProperties = {
  position: "relative",
  width: boardPx,
  height: boardPx,
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 8,
  overflow: "hidden",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const boardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(10, 1fr)",
  gridTemplateRows: "repeat(10, 1fr)",
  width: boardPx,
  height: boardPx,
};

const squareStyle: CSSProperties = {
  position: "relative",
  border: "none",
  padding: 0,
  margin: 0,
};

const svgStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const squareNoStyle: CSSProperties = {
  position: "absolute",
  top: 4,
  left: 5,
  fontSize: 10,
  color: "rgba(0,0,0,0.35)",
};

const highlightStyle: CSSProperties = {
  position: "absolute",
  inset: 5,
  borderRadius: 10,
};

const pieceWrapStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
};

const pieceStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  fontWeight: 700,
  boxSizing: "border-box",
};