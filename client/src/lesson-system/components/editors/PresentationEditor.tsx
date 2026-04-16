import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ArrowSpec,
  EditorMode,
  HighlightSpec,
  PieceCode,
  PresentationState,
  RouteSpec,
  SideToMove,
} from "../../types/presentationTypes";
import { createEmptyPieces, createInitialPieces } from "../../utils/boardSquares";
import ArrowEditor from "./ArrowEditor";
import BoardSceneEditor from "./BoardSceneEditor";
import HighlightEditor from "./HighlightEditor";
import PaintToolbar from "./PaintToolbar";
import RouteEditor from "./RouteEditor";

type Props = {
  initialPresentation?: Partial<PresentationState>;
};

export default function PresentationEditor({ initialPresentation }: Props) {
  const [mode, setMode] = useState<EditorMode>("paint");
  const [paintTool, setPaintTool] = useState<PieceCode | "eraser">("wm");
  const [sideToMove, setSideToMove] = useState<SideToMove>("white");
  const [piecesBySquare, setPiecesBySquare] = useState<Record<number, PieceCode>>(
    createInitialPieces()
  );

  const [highlights, setHighlights] = useState<HighlightSpec[]>(
    Array.isArray(initialPresentation?.highlights)
      ? initialPresentation.highlights
      : []
  );
  const [arrows, setArrows] = useState<ArrowSpec[]>(
    Array.isArray(initialPresentation?.arrows)
      ? initialPresentation.arrows
      : []
  );
  const [routes, setRoutes] = useState<RouteSpec[]>(
    Array.isArray(initialPresentation?.routes)
      ? initialPresentation.routes
      : []
  );

  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    Array.isArray(initialPresentation?.highlights) && initialPresentation.highlights[0]
      ? initialPresentation.highlights[0].id
      : null
  );
  const [activeArrowId, setActiveArrowId] = useState<string | null>(
    Array.isArray(initialPresentation?.arrows) && initialPresentation.arrows[0]
      ? initialPresentation.arrows[0].id
      : null
  );
  const [activeRouteId, setActiveRouteId] = useState<string | null>(
    Array.isArray(initialPresentation?.routes) && initialPresentation.routes[0]
      ? initialPresentation.routes[0].id
      : null
  );
  const [pendingArrowFrom, setPendingArrowFrom] = useState<number | null>(null);

  const activeHighlight = useMemo(
    () => highlights.find((item) => item.id === activeHighlightId) ?? null,
    [highlights, activeHighlightId]
  );

  const activeArrow = useMemo(
    () => arrows.find((item) => item.id === activeArrowId) ?? null,
    [arrows, activeArrowId]
  );

  const activeRoute = useMemo(
    () => routes.find((item) => item.id === activeRouteId) ?? null,
    [routes, activeRouteId]
  );

  const ensureActiveHighlight = () => {
    if (activeHighlight) return activeHighlight.id;

    const next: HighlightSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "primary",
      pulse: false,
      fill: true,
      outline: true,
    };

    setHighlights((prev) => [...prev, next]);
    setActiveHighlightId(next.id);
    return next.id;
  };

  const ensureActiveArrow = () => {
    if (activeArrow) return activeArrow.id;

    const next: ArrowSpec = {
      id: crypto.randomUUID(),
      from: null,
      to: null,
      color: "success",
      curved: false,
      dashed: false,
      label: "",
    };

    setArrows((prev) => [...prev, next]);
    setActiveArrowId(next.id);
    return next.id;
  };

  const ensureActiveRoute = () => {
    if (activeRoute) return activeRoute.id;

    const next: RouteSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "info",
      closed: false,
      dashed: false,
      label: "",
    };

    setRoutes((prev) => [...prev, next]);
    setActiveRouteId(next.id);
    return next.id;
  };

  const handleSquareClick = (square: number) => {
    if (mode === "paint") {
      setPiecesBySquare((prev) => ({
        ...prev,
        [square]: paintTool === "eraser" ? "empty" : paintTool,
      }));
      return;
    }

    if (mode === "highlight") {
      const id = ensureActiveHighlight();

      setHighlights((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;

          const currentSquares = item.squares ?? [];
          const exists = currentSquares.includes(square);

          return {
            ...item,
            squares: exists
              ? currentSquares.filter((s) => s !== square)
              : [...currentSquares, square],
          };
        })
      );
      return;
    }

    if (mode === "arrow") {
      const id = ensureActiveArrow();

      if (pendingArrowFrom == null) {
        setPendingArrowFrom(square);
        setArrows((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, from: square, to: null } : item
          )
        );
      } else {
        setArrows((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, from: pendingArrowFrom, to: square } : item
          )
        );
        setPendingArrowFrom(null);
      }
      return;
    }

    if (mode === "route") {
      const id = ensureActiveRoute();

      setRoutes((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;

          const nextSquares = Array.isArray(item.squares) ? [...item.squares] : [];
          if (nextSquares[nextSquares.length - 1] !== square) {
            nextSquares.push(square);
          }

          return {
            ...item,
            squares: nextSquares,
          };
        })
      );
    }
  };

  return (
    <div style={layoutStyle}>
      <div style={mainStyle}>
        <div style={sectionStyle}>
          <div style={modeBarStyle}>
            {(
              ["paint", "highlight", "arrow", "route", "validation", "record"] as EditorMode[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                style={{
                  ...modeButtonStyle,
                  ...(mode === item ? activeModeButtonStyle : null),
                }}
              >
                {labelForMode(item)}
              </button>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <PaintToolbar
            selectedTool={paintTool}
            sideToMove={sideToMove}
            onSelectTool={setPaintTool}
            onSetSideToMove={setSideToMove}
            onClearBoard={() => setPiecesBySquare(createEmptyPieces())}
            onResetBoard={() => setPiecesBySquare(createInitialPieces())}
          />
        </div>

        <div style={boardRowStyle}>
          <BoardSceneEditor
            piecesBySquare={piecesBySquare}
            highlights={highlights}
            arrows={arrows}
            routes={routes}
            onSquareClick={handleSquareClick}
          />

          <div style={sidePanelStyle}>
            <div style={statusCardStyle}>
              <div>
                <strong>Mode:</strong> {mode}
              </div>
              <div>
                <strong>Active highlight:</strong> {activeHighlightId ?? "none"}
              </div>
              <div>
                <strong>Active arrow:</strong> {activeArrowId ?? "none"}
              </div>
              <div>
                <strong>Active route:</strong> {activeRouteId ?? "none"}
              </div>
              <div>
                <strong>Pending arrow:</strong> {pendingArrowFrom ?? "-"}
              </div>
              <div>
                <strong>Side to move:</strong> {sideToMove}
              </div>
            </div>

            <HighlightEditor
              highlights={highlights}
              activeHighlightId={activeHighlightId}
              onChange={setHighlights}
              onSetActiveHighlightId={setActiveHighlightId}
            />

            <ArrowEditor
              arrows={arrows}
              activeArrowId={activeArrowId}
              pendingArrowFrom={pendingArrowFrom}
              onChange={setArrows}
              onSetActiveArrowId={setActiveArrowId}
              onResetPendingArrow={() => setPendingArrowFrom(null)}
            />

            <RouteEditor
              routes={routes}
              activeRouteId={activeRouteId}
              onChange={setRoutes}
              onSetActiveRouteId={setActiveRouteId}
              onClearActiveRoute={() => {
                if (!activeRouteId) return;

                setRoutes((prev) =>
                  prev.map((item) =>
                    item.id === activeRouteId ? { ...item, squares: [] } : item
                  )
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function labelForMode(mode: EditorMode) {
  switch (mode) {
    case "paint":
      return "Paint";
    case "highlight":
      return "Highlight";
    case "arrow":
      return "Arrow";
    case "route":
      return "Route";
    case "validation":
      return "Validation";
    case "record":
      return "Record";
    default:
      return mode;
  }
}

const layoutStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const mainStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const sectionStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 12,
};

const modeBarStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const modeButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 700,
  WebkitTextFillColor: "#111827",
};

const activeModeButtonStyle: CSSProperties = {
  border: "2px solid #4f46e5",
  boxShadow: "0 0 0 3px rgba(79,70,229,0.12)",
};

const boardRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const sidePanelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const statusCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  padding: 12,
  background: "#f8fafc",
  display: "grid",
  gap: 6,
  fontSize: 14,
  color: "#111827",
};