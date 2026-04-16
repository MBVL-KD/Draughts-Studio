import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ForwardedRef } from "react";
import { useNodeEngineAnalysis } from "../../engine/scan/useNodeEngineAnalysis";
import {
  boardStateToFen,
  fenToBoardState,
} from "../../features/board/fenUtils";
import {
  createEmptyBoardState,
  type SideToMove,
} from "../../features/board/boardTypes";
import type { AnalysisNode, SourceDocument } from "../types/analysisTypes";
import type { EngineMove } from "../source-editor/sourceBoardEngine";
import type { EngineAnalysisSnapshot } from "../types/analysisTypes";
import type {
  SourceBoardMode,
  SourceBoardMoveEvent,
} from "../source-editor/sourceBoardTypes";
import type { SetupBrush } from "../source-editor/sourceBoardAdapter";
import { findNodeById } from "../source-editor/sourceTree";
import SourceBoardSurface from "./SourceBoardSurface";
import NotationMoveAnimationOverlay from "./NotationMoveAnimationOverlay";
import {
  computeNotationAnimFrame,
  prepareNotationAnimFromEngineMove,
  prepareNotationAnimFromNotation,
  readStudioMoveAnimationSeconds,
  runNotationMoveAnimation,
  type NotationAnimMetadata,
} from "../utils/notationMoveAnimation";
import { resolveNotationToEngineMove } from "../utils/resolveNotationToEngineMove";
import type { LanguageCode } from "../types/i18nTypes";
import type { AnalysisBoardInteraction } from "./AnalysisBoardCanvas";
import type { ArrowSpec, HighlightColor, HighlightSpec } from "../types/presentationTypes";

type Props = {
  language?: LanguageCode;
  document: SourceDocument;
  selectedNodeId: string | null;
  currentFen: string;
  mode: SourceBoardMode;
  onSelectNode: (nodeId: string) => void;
  onPlayMove: (event: SourceBoardMoveEvent) => void;
  onEditFen: (fen: string) => void;
  onEngineSnapshot?: (snapshot: EngineAnalysisSnapshot) => void;
  onUpdateNodeOverlays?: (patch: {
    highlights?: HighlightSpec[];
    arrows?: ArrowSpec[];
  }) => void;
};

export type SourceBoardWorkspaceHandle = {
  /** Mainline child (same as ▶). Returns false if there is no such child. */
  navigateMainChildForward: () => boolean;
};

function toSourceBoardMoveEvent(em: EngineMove): SourceBoardMoveEvent {
  return {
    move: {
      notation: em.notation,
      side: em.side,
      from: em.from,
      to: em.to,
      path: em.path,
      captures: em.captures,
    },
    fenAfter: em.fenAfter,
  };
}

const INTERNATIONAL_START_FEN =
  "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20";

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function getChildren(document: SourceDocument, nodeId: string | null): AnalysisNode[] {
  if (!nodeId) return [];
  const node = document.nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  return node.childrenIds
    .map((id) => document.nodes.find((n) => n.id === id))
    .filter((n): n is AnalysisNode => !!n)
    .sort((a, b) => {
      const aMain = a.isMainline !== false ? 0 : 1;
      const bMain = b.isMainline !== false ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      return a.plyIndex - b.plyIndex;
    });
}

function getMainChild(document: SourceDocument, nodeId: string | null): AnalysisNode | null {
  return getChildren(document, nodeId)[0] ?? null;
}

function getParentNode(document: SourceDocument, node: AnalysisNode | null): AnalysisNode | null {
  if (!node?.parentId) return null;
  return findNodeById(document, node.parentId);
}

function getRootNode(document: SourceDocument): AnalysisNode | null {
  return findNodeById(document, document.rootNodeId);
}

function getMainlineEnd(document: SourceDocument, startNodeId: string | null): AnalysisNode | null {
  let current = startNodeId ? findNodeById(document, startNodeId) : null;
  if (!current) return null;
  while (true) {
    const next = getMainChild(document, current.id);
    if (!next) return current;
    current = next;
  }
}

function formatEval(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function safelyParseFen(fen: string) {
  try {
    if (!fen.trim()) return createEmptyBoardState();
    return fenToBoardState(fen);
  } catch {
    return createEmptyBoardState();
  }
}

function setFenSideToMove(fen: string, side: SideToMove): string {
  const board = safelyParseFen(fen);
  board.sideToMove = side;
  return boardStateToFen(board);
}

const OVERLAY_COLORS: HighlightColor[] = [
  "primary",
  "success",
  "warning",
  "danger",
  "info",
];

function nextOverlayColorByCount(count: number): HighlightColor {
  if (count <= 0) return OVERLAY_COLORS[0];
  return OVERLAY_COLORS[count % OVERLAY_COLORS.length];
}

function toggleNumber(list: number[], value: number): number[] {
  if (list.includes(value)) return list.filter((x) => x !== value);
  return [...list, value];
}

function ensureActiveHighlightInList(
  highlights: HighlightSpec[],
  currentActiveId: string | null
): {
  list: HighlightSpec[];
  active: HighlightSpec;
  activeId: string;
} {
  const existing =
    highlights.find((h) => h.id === currentActiveId) ?? highlights[0];

  if (existing) {
    return {
      list: highlights,
      active: existing,
      activeId: existing.id,
    };
  }

  const created: HighlightSpec = {
    id: crypto.randomUUID(),
    squares: [],
    color: "primary",
    pulse: false,
    fill: true,
    outline: true,
  };

  return {
    list: [...highlights, created],
    active: created,
    activeId: created.id,
  };
}

function ensureActiveArrowInList(
  arrows: ArrowSpec[],
  currentActiveId: string | null
): {
  list: ArrowSpec[];
  active: ArrowSpec;
  activeId: string;
} {
  if (currentActiveId) {
    const existing = arrows.find((a) => a.id === currentActiveId);
    if (existing) {
      return {
        list: arrows,
        active: existing,
        activeId: existing.id,
      };
    }
  }

  const created: ArrowSpec = {
    id: crypto.randomUUID(),
    from: null,
    to: null,
    color: nextOverlayColorByCount(arrows.length),
    curved: false,
    dashed: false,
    label: "",
  };

  return {
    list: [...arrows, created],
    active: created,
    activeId: created.id,
  };
}

function snapshotKey(snapshot: EngineAnalysisSnapshot): string {
  return JSON.stringify({
    status: snapshot.status,
    bestMove: snapshot.bestMove ?? null,
    evaluation: snapshot.evaluation ?? null,
    depth: snapshot.depth ?? null,
    pv: snapshot.pv ?? [],
    errorMessage: snapshot.errorMessage ?? null,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PieceGlyph({ kind }: { kind: "wm" | "wk" | "bm" | "bk" }) {
  const isWhite = kind === "wm" || kind === "wk";
  const isKing = kind === "wk" || kind === "bk";

  return (
    <div
      style={{
        width: 34,
        height: 34,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 30,
          height: 30,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
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
            position: "absolute",
            inset: 5,
            borderRadius: "50%",
            border: isWhite
              ? "2px solid rgba(148,163,184,0.95)"
              : "2px solid rgba(255,255,255,0.22)",
          }}
        />
        {isKing ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 900,
              lineHeight: 1,
              color: isWhite ? "#111827" : "#ffffff",
            }}
          >
            ★
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolButton({
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
      style={active ? activeToolButtonStyle : toolButtonStyle}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function SourceBoardWorkspaceInner(
  {
    language = "nl",
    document,
    selectedNodeId,
    currentFen,
    mode,
    onSelectNode,
    onPlayMove,
    onEditFen,
    onEngineSnapshot = () => undefined,
    onUpdateNodeOverlays,
  }: Props,
  ref: ForwardedRef<SourceBoardWorkspaceHandle>
) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [setupBrush, setSetupBrush] = useState<SetupBrush>("wm");
  const [isFlipped, setIsFlipped] = useState(false);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const [boardInteraction, setBoardInteraction] = useState<AnalysisBoardInteraction>("play");
  const hlRef = useRef<string | null>(null);
  const arRef = useRef<string | null>(null);
  const arFromRef = useRef<number | null>(null);
  const arForceRef = useRef(false);

  const selectedNode = useMemo(() => findNodeById(document, selectedNodeId), [document, selectedNodeId]);
  const parentNode = useMemo(() => getParentNode(document, selectedNode), [document, selectedNode]);
  const mainChild = useMemo(() => getMainChild(document, selectedNodeId), [document, selectedNodeId]);
  const rootNode = useMemo(() => getRootNode(document), [document]);
  const endNode = useMemo(() => getMainlineEnd(document, selectedNodeId), [document, selectedNodeId]);
  const currentBoard = useMemo(() => safelyParseFen(currentFen), [currentFen]);

  const engineAnalysis = useNodeEngineAnalysis({
    enabled: mode === "play",
    variantId: document.variantId ?? "international",
    fen: currentFen,
    depth: 8,
    multiPv: 1,
  });

  useEffect(() => {
    if (mode !== "play") return;
    if (!engineAnalysis) return;
    if (engineAnalysis.status === "loading") return;
    const key = snapshotKey(engineAnalysis);
    if (lastSnapshotKeyRef.current === key) return;
    lastSnapshotKeyRef.current = key;
    onEngineSnapshot(engineAnalysis);
  }, [mode, engineAnalysis, onEngineSnapshot]);

  useEffect(() => {
    hlRef.current = null;
    arRef.current = null;
    arFromRef.current = null;
    arForceRef.current = false;
    setBoardInteraction("play");
  }, [selectedNodeId]);

  const selectedHighlights = selectedNode?.highlights ?? [];
  const selectedArrows = selectedNode?.arrows ?? [];

  const handleAnnotateHighlight = useCallback(
    (square: number) => {
      if (!onUpdateNodeOverlays) return;
      const ensured = ensureActiveHighlightInList(selectedHighlights, hlRef.current);
      hlRef.current = ensured.activeId;
      const nextHighlights = ensured.list.map((h) =>
        h.id === ensured.active.id
          ? { ...h, squares: toggleNumber(h.squares ?? [], square) }
          : h
      );
      onUpdateNodeOverlays({ highlights: nextHighlights });
    },
    [onUpdateNodeOverlays, selectedHighlights]
  );

  const handleAnnotateArrow = useCallback(
    (square: number) => {
      if (!onUpdateNodeOverlays) return;
      const ensured = ensureActiveArrowInList(
        selectedArrows,
        arForceRef.current ? null : arRef.current
      );
      arForceRef.current = false;
      arRef.current = ensured.activeId;
      if (arFromRef.current == null) {
        arFromRef.current = square;
        const nextArrows = ensured.list.map((a) =>
          a.id === ensured.active.id ? { ...a, from: square, to: null } : a
        );
        onUpdateNodeOverlays({ arrows: nextArrows });
        return;
      }
      const from = arFromRef.current;
      arFromRef.current = null;
      arRef.current = null;
      arForceRef.current = true;
      const nextArrows = ensured.list.map((a) =>
        a.id === ensured.active.id ? { ...a, from, to: square } : a
      );
      onUpdateNodeOverlays({ arrows: nextArrows });
    },
    [onUpdateNodeOverlays, selectedArrows]
  );

  const handleSetSideToMove = (side: SideToMove) => onEditFen(setFenSideToMove(currentFen, side));
  const handleClearBoard = () => onEditFen(boardStateToFen(createEmptyBoardState()));
  const handleLoadStartPosition = () => onEditFen(INTERNATIONAL_START_FEN);

  const atRoot = !rootNode || rootNode.id === selectedNodeId;
  const atEnd = !endNode || endNode.id === selectedNodeId;

  const notationAnimRef = useRef<{ meta: NotationAnimMetadata; currentT: number } | null>(null);
  const notationAnimCancelRef = useRef<(() => void) | null>(null);
  const [notationAnimVersion, setNotationAnimVersion] = useState(0);

  const cancelNotationAnim = useCallback(() => {
    notationAnimCancelRef.current?.();
    notationAnimCancelRef.current = null;
    notationAnimRef.current = null;
    setNotationAnimVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    cancelNotationAnim();
  }, [selectedNodeId, currentFen, cancelNotationAnim]);

  useEffect(() => () => cancelNotationAnim(), [cancelNotationAnim]);

  const boardFenForSurface = useMemo(() => {
    void notationAnimVersion;
    const a = notationAnimRef.current;
    if (!a) return currentFen;
    const frame = computeNotationAnimFrame(a.meta, a.currentT, isFlipped);
    return boardStateToFen(frame.displayBoard);
  }, [currentFen, isFlipped, notationAnimVersion]);

  const notationOverlay = useMemo(() => {
    void notationAnimVersion;
    const a = notationAnimRef.current;
    if (!a) return null;
    return computeNotationAnimFrame(a.meta, a.currentT, isFlipped);
  }, [isFlipped, notationAnimVersion]);

  const isNotationAnimating = notationOverlay != null;

  const runNotationThen = useCallback(
    (meta: NotationAnimMetadata, after: () => void) => {
      const sec = readStudioMoveAnimationSeconds();
      if (sec <= 0) {
        after();
        return;
      }
      cancelNotationAnim();
      notationAnimRef.current = { meta, currentT: 0 };
      setNotationAnimVersion((n) => n + 1);
      notationAnimCancelRef.current = runNotationMoveAnimation({
        meta,
        flipped: isFlipped,
        secondsPerMove: sec,
        onFrame: (_f, t) => {
          notationAnimRef.current = { meta, currentT: t };
          setNotationAnimVersion((n) => n + 1);
        },
        onComplete: () => {
          notationAnimCancelRef.current = null;
          notationAnimRef.current = null;
          setNotationAnimVersion((n) => n + 1);
          after();
        },
      });
    },
    [cancelNotationAnim, isFlipped]
  );

  const handleNavigateMainChildForward = useCallback((): boolean => {
    if (isNotationAnimating) return true;
    if (!mainChild) return false;
    const notation = mainChild.move?.notation?.trim();
    if (!notation) {
      onSelectNode(mainChild.id);
      return true;
    }
    const meta = prepareNotationAnimFromNotation(currentBoard, notation);
    if (!meta) {
      onSelectNode(mainChild.id);
      return true;
    }
    runNotationThen(meta, () => onSelectNode(mainChild.id));
    return true;
  }, [currentBoard, isNotationAnimating, mainChild, onSelectNode, runNotationThen]);

  const handlePlayBestEngineMove = useCallback(() => {
    if (isNotationAnimating) return;
    if (mode !== "play") return;
    const bm = (engineAnalysis?.pv?.[0] ?? engineAnalysis?.bestMove ?? "").trim();
    if (!bm) return;
    const em = resolveNotationToEngineMove(currentBoard, bm);
    if (!em) return;
    const meta = prepareNotationAnimFromEngineMove(currentBoard, em);
    if (!meta) {
      onPlayMove(toSourceBoardMoveEvent(em));
      return;
    }
    runNotationThen(meta, () => onPlayMove(toSourceBoardMoveEvent(em)));
  }, [currentBoard, engineAnalysis, isNotationAnimating, mode, onPlayMove, runNotationThen]);

  useImperativeHandle(
    ref,
    () => ({
      navigateMainChildForward: () => handleNavigateMainChildForward(),
    }),
    [handleNavigateMainChildForward]
  );

  return (
    // This component fills the space given to it by the parent (SourceEditor tab panel).
    // Layout: [engine strip OR setup toolbar] → [board] → [nav bar]
    // The board area gets all leftover vertical space.
    <div style={rootStyle}>

      {/* ── Row 1: engine eval strip (play mode) or setup toolbar (setup mode) ── */}
      {mode === "play" ? (
        <div style={engineStripStyle}>
          {/* Score pill — larger */}
          <div style={evalPillStyle}>
            <span style={evalLabelStyle}>eval</span>
            <span style={evalValueStyle}>
              {formatEval(engineAnalysis?.evaluation)}
            </span>
          </div>

          {/* Best move pill */}
          <div style={movePillStyle}>
            <span style={pillLabelStyle}>best</span>
            <span style={pillValueStyle}>
              {engineAnalysis?.bestMove ?? "—"}
            </span>
          </div>
          <button
            type="button"
            title={t("Play engine best move on the board", "Zet beste zet van Scan op het bord")}
            onClick={handlePlayBestEngineMove}
            disabled={
              isNotationAnimating ||
              engineAnalysis?.status === "loading" ||
              !(engineAnalysis?.pv?.[0] ?? engineAnalysis?.bestMove)?.trim()
            }
            style={playBestButtonStyle}
          >
            {t("Play", "Zet")}
          </button>

          {/* PV pill */}
          {engineAnalysis?.pv && engineAnalysis.pv.length > 1 && (
            <div style={pvPillStyle}>
              <span style={pillLabelStyle}>pv</span>
              <span style={pvValueStyle}>
                {engineAnalysis.pv.slice(1).join("  ")}
              </span>
            </div>
          )}

          {onUpdateNodeOverlays ? (
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 4,
                flexShrink: 0,
                alignItems: "center",
              }}
            >
              <ToolButton
                title={t("Moves", "Zetten")}
                active={boardInteraction === "play"}
                onClick={() => setBoardInteraction("play")}
              >
                ▶
              </ToolButton>
              <ToolButton
                title={t("Highlight for this node", "Markering (knoop)")}
                active={boardInteraction === "annotate-highlight"}
                onClick={() => setBoardInteraction("annotate-highlight")}
              >
                ▣
              </ToolButton>
              <ToolButton
                title={t("Arrow for this node", "Pijl (knoop)")}
                active={boardInteraction === "annotate-arrow"}
                onClick={() => setBoardInteraction("annotate-arrow")}
              >
                ↗
              </ToolButton>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={setupToolbarStyle}>
          <ToolButton title="White man" active={setupBrush === "wm"} onClick={() => setSetupBrush("wm")}>
            <PieceGlyph kind="wm" />
          </ToolButton>
          <ToolButton title="White king" active={setupBrush === "wk"} onClick={() => setSetupBrush("wk")}>
            <PieceGlyph kind="wk" />
          </ToolButton>
          <ToolButton title="Black man" active={setupBrush === "bm"} onClick={() => setSetupBrush("bm")}>
            <PieceGlyph kind="bm" />
          </ToolButton>
          <ToolButton title="Black king" active={setupBrush === "bk"} onClick={() => setSetupBrush("bk")}>
            <PieceGlyph kind="bk" />
          </ToolButton>
          <ToolButton title="Eraser" active={setupBrush === "empty"} onClick={() => setSetupBrush("empty")}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>⌫</span>
          </ToolButton>

          <div style={toolbarDividerStyle} />

          <button
            type="button"
            title="White to move"
            onClick={() => handleSetSideToMove("W")}
            style={currentBoard.sideToMove === "W" ? activeSideButtonStyle : sideButtonStyle}
          >
            W
          </button>
          <button
            type="button"
            title="Black to move"
            onClick={() => handleSetSideToMove("B")}
            style={currentBoard.sideToMove === "B" ? activeSideButtonStyle : sideButtonStyle}
          >
            B
          </button>

          <div style={toolbarDividerStyle} />

          <button type="button" onClick={handleClearBoard} style={actionButtonStyle}>{t("Clear", "Wissen")}</button>
          <button type="button" onClick={handleLoadStartPosition} style={actionButtonStyle}>{t("Start", "Start")}</button>
        </div>
      )}

      {/* ── Row 2: board — grows to fill remaining vertical space ── */}
      <div style={boardAreaStyle}>
        <SourceBoardSurface
          fen={boardFenForSurface}
          mode={mode}
          setupBrush={setupBrush}
          flipped={isFlipped}
          bestMoveNotation={
            mode === "play"
              ? engineAnalysis?.pv?.[0] ?? engineAnalysis?.bestMove ?? null
              : null
          }
          onMovePlayed={onPlayMove}
          onFenEdited={onEditFen}
          boardInteraction={mode === "play" ? boardInteraction : "play"}
          layerHighlights={mode === "play" ? selectedHighlights : []}
          layerArrows={mode === "play" ? selectedArrows : []}
          onAnnotateHighlightClick={handleAnnotateHighlight}
          onAnnotateArrowClick={handleAnnotateArrow}
          boardOverlay={
            notationOverlay ? (
              <NotationMoveAnimationOverlay
                flipped={isFlipped}
                ghostPos={notationOverlay.ghostPos}
                movingPiece={notationOverlay.movingPiece}
                captureGhosts={notationOverlay.captureGhosts}
                captureOpacity={notationOverlay.captureOpacity}
              />
            ) : null
          }
        />
      </div>

      {/* ── Row 3: navigation bar ── */}
      <div style={navBarStyle}>
        <button
          type="button"
          title="Go to start"
          onClick={() => rootNode && onSelectNode(rootNode.id)}
          disabled={atRoot}
          style={navButtonStyle}
        >
          ⏮
        </button>
        <button
          type="button"
          title="Previous move"
          onClick={() => parentNode && onSelectNode(parentNode.id)}
          disabled={!parentNode}
          style={navButtonStyle}
        >
          ◀
        </button>
        <button
          type="button"
          title="Next move"
          onClick={() => handleNavigateMainChildForward()}
          disabled={!mainChild || isNotationAnimating}
          style={navButtonStyle}
        >
          ▶
        </button>
        <button
          type="button"
          title="Go to end"
          onClick={() => endNode && onSelectNode(endNode.id)}
          disabled={atEnd}
          style={navButtonStyle}
        >
          ⏭
        </button>
        <button
          type="button"
          title="Rotate board orientation"
          onClick={() => setIsFlipped((prev) => !prev)}
          style={navButtonStyle}
        >
          Flip
        </button>
      </div>
    </div>
  );
}

const SourceBoardWorkspace = forwardRef(SourceBoardWorkspaceInner);
export default SourceBoardWorkspace;

// ─── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  // Fills the tab panel height completely, columns handled by parent
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  gap: 6,
  padding: "6px 8px 0 10px",
  boxSizing: "border-box",
};

// Engine eval strip — row of pills
const engineStripStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 36,
  minWidth: 0,
  paddingRight: 4,
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "thin",
};

// Score pill — bigger, prominent
const evalPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "#1e3a5f",
  borderRadius: 10,
  padding: "4px 10px 4px 8px",
  flexShrink: 0,
};

const evalLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.5)",
  lineHeight: 1,
};

const evalValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#fff",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};

// Best move pill
const movePillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "#f0f4ff",
  border: "1px solid #c7d7f5",
  borderRadius: 10,
  padding: "4px 10px 4px 8px",
  flexShrink: 0,
};

const pillLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
  lineHeight: 1,
};

const pillValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1e40af",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const playBestButtonStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 10,
  border: "1px solid #93b4f0",
  background: "#e8efff",
  color: "#1e3a8a",
  fontSize: 12,
  fontWeight: 800,
  padding: "6px 12px",
  cursor: "pointer",
};

// PV pill — wider, scrollable
const pvPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "4px 10px 4px 8px",
  minWidth: 0,
  overflow: "hidden",
};

const pvValueStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontVariantNumeric: "tabular-nums",
};

// Setup toolbar
const setupToolbarStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  minHeight: 30,
};

const toolButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid #c7c7c7",
  background: "#ffffff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
};

const activeToolButtonStyle: CSSProperties = {
  ...toolButtonStyle,
  border: "2px solid #2b7fff",
  background: "#eef5ff",
};

const sideButtonStyle: CSSProperties = {
  border: "1px solid #c7c7c7",
  background: "#fff",
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  color: "#111827",
  height: 38,
};

const activeSideButtonStyle: CSSProperties = {
  ...sideButtonStyle,
  border: "2px solid #2b7fff",
  background: "#eef5ff",
};

const actionButtonStyle: CSSProperties = {
  border: "1px solid #c7c7c7",
  background: "#fff",
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
  height: 38,
};

const toolbarDividerStyle: CSSProperties = {
  width: 1,
  height: 22,
  background: "#e2e8f0",
  margin: "0 2px",
};

// Board area — this is the key: it grows to fill all remaining space
const boardAreaStyle: CSSProperties = {
  flex: "1 1 0",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
};

// Navigation bar
const navBarStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  gap: 6,
  marginBottom: 8,
};

const navButtonStyle: CSSProperties = {
  flex: "1 1 0",
  height: 34,
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  color: "#111827",
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};