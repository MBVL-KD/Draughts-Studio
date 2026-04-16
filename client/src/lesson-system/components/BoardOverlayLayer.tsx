import { useId, type CSSProperties } from "react";
import type {
  ArrowSpec,
  HighlightSpec,
  RouteSpec,
} from "../types/presentationTypes";
import {
  buildPolylinePoints,
  getSquareCenter,
  getSquareRect,
} from "../utils/boardOverlayGeometry";

export type BoardSquareGlyph = {
  id: string;
  square: number;
  text: string;
};

type Props = {
  boardSize: 8 | 10;
  highlights?: HighlightSpec[];
  arrows?: ArrowSpec[];
  routes?: RouteSpec[];
  /** Authoring / preview: glyph badges anchored to squares (e.g. NAG-style marks). */
  squareGlyphs?: BoardSquareGlyph[];
};

const COLOR_MAP: Record<
  "primary" | "success" | "warning" | "danger" | "info",
  { fill: string; stroke: string; soft: string }
> = {
  primary: {
    fill: "rgba(59, 130, 246, 0.22)",
    stroke: "#2563eb",
    soft: "rgba(59, 130, 246, 0.55)",
  },
  success: {
    fill: "rgba(34, 197, 94, 0.22)",
    stroke: "#16a34a",
    soft: "rgba(34, 197, 94, 0.55)",
  },
  warning: {
    fill: "rgba(245, 158, 11, 0.22)",
    stroke: "#d97706",
    soft: "rgba(245, 158, 11, 0.55)",
  },
  danger: {
    fill: "rgba(239, 68, 68, 0.20)",
    stroke: "#dc2626",
    soft: "rgba(239, 68, 68, 0.55)",
  },
  info: {
    fill: "rgba(6, 182, 212, 0.20)",
    stroke: "#0891b2",
    soft: "rgba(6, 182, 212, 0.55)",
  },
};

const ARROW_COLOR_MAP: Record<
  "primary" | "success" | "warning" | "danger" | "info",
  { stroke: string; head: string; label: string }
> = {
  primary: {
    stroke: "rgba(79, 118, 186, 0.48)",
    head: "rgba(79, 118, 186, 0.64)",
    label: "#2f4f7f",
  },
  success: {
    stroke: "rgba(61, 130, 70, 0.48)",
    head: "rgba(61, 130, 70, 0.64)",
    label: "#2f6a37",
  },
  warning: {
    stroke: "rgba(177, 118, 41, 0.50)",
    head: "rgba(177, 118, 41, 0.66)",
    label: "#8f5d1f",
  },
  danger: {
    stroke: "rgba(170, 70, 70, 0.50)",
    head: "rgba(170, 70, 70, 0.66)",
    label: "#8c2f2f",
  },
  info: {
    stroke: "rgba(55, 128, 150, 0.50)",
    head: "rgba(55, 128, 150, 0.66)",
    label: "#1f6a82",
  },
};

export default function BoardOverlayLayer({
  boardSize,
  highlights = [],
  arrows = [],
  routes = [],
  squareGlyphs = [],
}: Props) {
  const markerPrefix = useId().replace(/:/g, "");

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: 8,
      }}
    >
      {highlights.map((highlight) => renderHighlight(highlight, boardSize))}

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
        }}
      >
        <defs>
          {(["primary", "success", "warning", "danger", "info"] as const).map(
            (role) => (
              <marker
                key={role}
                id={`${markerPrefix}-arrowhead-${role}`}
                markerWidth="6"
                markerHeight="6"
                refX="5.1"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 z" fill={ARROW_COLOR_MAP[role].head} />
              </marker>
            )
          )}
        </defs>

        {routes.map((route) => renderRoute(route, boardSize))}
        {arrows.map((arrow) => renderArrow(arrow, boardSize, markerPrefix))}
        {squareGlyphs.map((g) => {
          const p = getSquareCenter(g.square, boardSize);
          return (
            <text
              key={g.id}
              x={p.leftPct}
              y={p.topPct + 3.2}
              textAnchor="middle"
              fontSize="3.4"
              fill="#1e293b"
              fontWeight="800"
              stroke="#fff"
              strokeWidth="0.35"
              paintOrder="stroke"
            >
              {g.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function renderHighlight(highlight: HighlightSpec, boardSize: 8 | 10) {
  const shape = highlight.overlayShape ?? "square";

  return (highlight.squares ?? []).map((square) => {
    const rect = getSquareRect(square, boardSize);
    const colors = COLOR_MAP[highlight.color];

    if (shape === "ring") {
      const margin = 0.14;
      const scale = 0.72;
      const style: CSSProperties = {
        position: "absolute",
        left: `${rect.leftPct + rect.widthPct * margin}%`,
        top: `${rect.topPct + rect.heightPct * margin}%`,
        width: `${rect.widthPct * scale}%`,
        height: `${rect.heightPct * scale}%`,
        boxSizing: "border-box",
        borderRadius: "50%",
        background: highlight.fill ? colors.fill : "transparent",
        border: `3px solid ${colors.stroke}`,
        boxShadow: highlight.pulse ? `0 0 0 3px ${colors.soft}` : `0 0 0 1px ${colors.soft}`,
        transition: "all 120ms ease",
      };
      return <div key={`${highlight.id}-${square}-ring`} style={style} />;
    }

    const style: CSSProperties = {
      position: "absolute",
      left: `${rect.leftPct}%`,
      top: `${rect.topPct}%`,
      width: `${rect.widthPct}%`,
      height: `${rect.heightPct}%`,
      boxSizing: "border-box",
      background: highlight.fill ? colors.fill : "transparent",
      border: highlight.outline ? `2px solid ${colors.stroke}` : "none",
      boxShadow: highlight.pulse
        ? `0 0 0 4px ${colors.soft}`
        : `0 0 0 1px ${colors.soft}`,
      borderRadius: 8,
      transition: "all 120ms ease",
    };

    return <div key={`${highlight.id}-${square}`} style={style} />;
  });
}

function renderArrow(arrow: ArrowSpec, boardSize: 8 | 10, markerPrefix: string) {
  const colors = ARROW_COLOR_MAP[arrow.color];

  if (typeof arrow.from === "number" && typeof arrow.to === "number") {
    const from = getSquareCenter(arrow.from, boardSize);
    const to = getSquareCenter(arrow.to, boardSize);

    if (arrow.curved) {
      const midX = (from.leftPct + to.leftPct) / 2;
      const midY = (from.topPct + to.topPct) / 2 - 6;

      return (
        <g key={arrow.id}>
          <path
            d={`M ${from.leftPct} ${from.topPct} Q ${midX} ${midY} ${to.leftPct} ${to.topPct}`}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="3.4"
            strokeLinecap="round"
            opacity={0.34}
            strokeDasharray={arrow.dashed ? "3 2" : undefined}
          />
          <path
            d={`M ${from.leftPct} ${from.topPct} Q ${midX} ${midY} ${to.leftPct} ${to.topPct}`}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
            markerEnd={`url(#${markerPrefix}-arrowhead-${arrow.color})`}
            opacity={0.92}
            strokeDasharray={arrow.dashed ? "3 2" : undefined}
          />
          {arrow.label
            ? renderArrowLabel(arrow.to, boardSize, arrow.label, colors.label)
            : null}
        </g>
      );
    }

    return (
      <g key={arrow.id}>
        <line
          x1={from.leftPct}
          y1={from.topPct}
          x2={to.leftPct}
          y2={to.topPct}
          stroke={colors.stroke}
          strokeWidth="3.4"
          strokeLinecap="round"
          opacity={0.34}
          strokeDasharray={arrow.dashed ? "3 2" : undefined}
        />
        <line
          x1={from.leftPct}
          y1={from.topPct}
          x2={to.leftPct}
          y2={to.topPct}
          stroke={colors.stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          markerEnd={`url(#${markerPrefix}-arrowhead-${arrow.color})`}
          opacity={0.92}
          strokeDasharray={arrow.dashed ? "3 2" : undefined}
        />
        {arrow.label
          ? renderArrowLabel(arrow.to, boardSize, arrow.label, colors.label)
          : null}
      </g>
    );
  }

  return null;
}

function renderRoute(route: RouteSpec, boardSize: 8 | 10) {
  const squares = route.squares ?? [];
  if (!squares.length) return null;

  const points = buildPolylinePoints(squares, boardSize);
  const colors = COLOR_MAP[route.color];

  return (
    <g key={route.id}>
      {squares.length >= 2 ? (
        <polyline
          points={points}
          fill={route.closed ? colors.fill : "none"}
          stroke={colors.stroke}
          strokeWidth="0.95"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
          strokeDasharray={route.dashed ? "2 1.2" : undefined}
        />
      ) : null}

      {squares.map((square, index) => {
        const p = getSquareCenter(square, boardSize);

        return (
          <g key={`${route.id}-${square}-${index}`}>
            <circle
              cx={p.leftPct}
              cy={p.topPct}
              r={1.35}
              fill={colors.stroke}
              opacity={0.95}
            />
            <text
              x={p.leftPct}
              y={p.topPct - 2}
              textAnchor="middle"
              fontSize="3"
              fill={colors.stroke}
              fontWeight="700"
            >
              {index + 1}
            </text>
          </g>
        );
      })}

      {route.label && squares.length > 0
        ? renderArrowLabel(
            squares[squares.length - 1],
            boardSize,
            route.label,
            colors.stroke
          )
        : null}
    </g>
  );
}

function renderArrowLabel(
  square: number,
  boardSize: 8 | 10,
  label: string,
  color: string
) {
  const p = getSquareCenter(square, boardSize);

  return (
    <text
      x={p.leftPct}
      y={p.topPct - 3}
      textAnchor="middle"
      fontSize="3"
      fill={color}
      fontWeight="700"
    >
      {label}
    </text>
  );
}