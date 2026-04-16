import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import type { AnalysisNode, SourceDocument } from "../types/analysisTypes";
import SourceBoardSurface from "./SourceBoardSurface";
import SourceMoveTextPanel from "./SourceMoveTextPanel";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import { uiText } from "../i18n/studioUiText";

type LineViewMode = "list" | "text";

type Props = {
  document: SourceDocument;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  language?: LanguageCode;
};

function buildNodeMap(document: SourceDocument) {
  return new Map(document.nodes.map((node) => [node.id, node] as const));
}

function getOrderedChildrenFromMap(
  node: AnalysisNode,
  nodeMap: Map<string, AnalysisNode>
): AnalysisNode[] {
  return (node.childrenIds ?? [])
    .map((id) => nodeMap.get(id))
    .filter((child): child is AnalysisNode => !!child)
    .sort((a, b) => {
      const aMain = a.isMainline !== false ? 0 : 1;
      const bMain = b.isMainline !== false ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      return a.plyIndex - b.plyIndex;
    });
}

function buildLineToNode(
  document: SourceDocument,
  targetNodeId: string | null
): AnalysisNode[] {
  const nodeMap = buildNodeMap(document);
  const getOrderedChildren = (node: AnalysisNode): AnalysisNode[] =>
    getOrderedChildrenFromMap(node, nodeMap);

  const target =
    (targetNodeId ? nodeMap.get(targetNodeId) : null) ??
    nodeMap.get(document.rootNodeId) ??
    null;

  if (!target) return [];

  // If root is selected, preview the full mainline by default.
  if (target.id === document.rootNodeId) {
    const line: AnalysisNode[] = [target];
    let current: AnalysisNode | undefined = target;
    while (current) {
      const nextMain: AnalysisNode | undefined = getOrderedChildren(current)[0];
      if (!nextMain) break;
      line.push(nextMain);
      current = nextMain;
    }
    return line;
  }

  const chain: AnalysisNode[] = [];
  let current: AnalysisNode | undefined = target;

  while (current) {
    chain.push(current);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }

  const line = chain.reverse();
  // Continue forward on the currently chosen branch so play can proceed
  // from a clicked move instead of always ending at that move.
  let tail = target;
  while (tail) {
    const nextTail = getOrderedChildren(tail)[0];
    if (!nextTail) break;
    line.push(nextTail);
    tail = nextTail;
  }

  return line;
}

function getNodeEvalText(node: AnalysisNode): string | null {
  if (node.engine?.status !== "ok" || typeof node.engine.evaluation !== "number") {
    return null;
  }
  const value = node.engine.evaluation;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function compactCaptureNotation(notation: string): string {
  if (!notation.includes("x")) return notation;
  const squares = notation
    .split("x")
    .map((part) => part.trim())
    .filter(Boolean);
  if (squares.length < 2) return notation;
  return `${squares[0]}x${squares[squares.length - 1]}`;
}

function getDisplayNotation(node: AnalysisNode): string {
  const notation = node.move?.notation ?? `Ply ${node.plyIndex}`;
  return compactCaptureNotation(notation);
}

export default function SourcePreviewPanel({
  document,
  selectedNodeId,
  onSelectNode: _onSelectNode,
  language = "nl",
}: Props) {
  const [previewTargetNodeId, setPreviewTargetNodeId] = useState<string | null>(
    selectedNodeId
  );

  useEffect(() => {
    setPreviewTargetNodeId(selectedNodeId);
  }, [selectedNodeId, document.rootNodeId]);

  const previewLine = useMemo(
    () => buildLineToNode(document, previewTargetNodeId),
    [document, previewTargetNodeId]
  );

  const previewLineKey = useMemo(
    () => previewLine.map((n) => n.id).join("|"),
    [previewLine]
  );

  const previewLineRef = useRef(previewLine);
  previewLineRef.current = previewLine;

  const [previewIndex, setPreviewIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lineView, setLineView] = useState<LineViewMode>("list");
  const pendingFocusNodeIdRef = useRef<string | null>(null);

  const navigateToNode = (nodeId: string) => {
    setIsPlaying(false);
    const currentLine = previewLineRef.current;
    const inCurrentLineIndex = currentLine.findIndex((node) => node.id === nodeId);
    if (inCurrentLineIndex >= 0) {
      setPreviewIndex(inCurrentLineIndex);
      pendingFocusNodeIdRef.current = null;
      return;
    }
    pendingFocusNodeIdRef.current = nodeId;
    setPreviewTargetNodeId(nodeId);
  };

  useEffect(() => {
    const focusNodeId = pendingFocusNodeIdRef.current;
    if (focusNodeId) {
      const focusIndex = previewLineRef.current.findIndex((node) => node.id === focusNodeId);
      setPreviewIndex(focusIndex >= 0 ? focusIndex : 0);
      pendingFocusNodeIdRef.current = null;
      return;
    }
    setPreviewIndex(0);
    setIsPlaying(false);
  }, [previewLineKey]);

  useEffect(() => {
    if (!isPlaying) return;

    const line = previewLineRef.current;
    if (line.length <= 1) return;
    if (previewIndex >= line.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setPreviewIndex((prev) => {
        const len = previewLineRef.current.length;
        return Math.min(prev + 1, Math.max(0, len - 1));
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isPlaying, previewIndex]);

  const previewNode = previewLine[previewIndex] ?? null;
  const previewFen = previewNode?.fenAfter ?? document.initialFen;
  const atFirst = previewIndex <= 0;
  const atLast = previewLine.length === 0 || previewIndex >= previewLine.length - 1;

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <div style={headerTitleBlockStyle}>
          <div style={eyebrowStyle}>{uiText(language, "preview")}</div>
          <div style={titleStyle}>{uiText(language, "replaySelectedLine")}</div>
        </div>

        <div style={metaWrapStyle}>
          <MetaCard
            label={uiText(language, "lineLength")}
            value={`${previewLine.length}`}
          />
          <MetaCard
            label={uiText(language, "position")}
            value={`${Math.min(previewIndex + 1, Math.max(previewLine.length, 1))}/${Math.max(previewLine.length, 1)}`}
          />
        </div>
      </div>

      <div style={contentStyle}>
        <div style={boardColumnStyle}>
          <div style={previewBoardAreaStyle}>
            <SourceBoardSurface
              fen={previewFen}
              mode="play"
              setupBrush="wm"
              onMovePlayed={() => undefined}
              onFenEdited={() => undefined}
              layerHighlights={previewNode?.highlights ?? []}
              layerArrows={previewNode?.arrows ?? []}
            />
          </div>

          <div style={replayNavBarStyle}>
            <button
              type="button"
              title="Eerste zet"
              disabled={atFirst}
              onClick={() => {
                setIsPlaying(false);
                setPreviewIndex(0);
              }}
              style={replayNavButtonStyle}
            >
              ⏮
            </button>
            <button
              type="button"
              title="Vorige zet"
              disabled={atFirst}
              onClick={() => {
                setIsPlaying(false);
                setPreviewIndex((prev) => Math.max(0, prev - 1));
              }}
              style={replayNavButtonStyle}
            >
              ◀
            </button>
            <button
              type="button"
              title={
                isPlaying
                  ? "Pauzeren"
                  : previewLine.length > 1 && atLast
                  ? "Opnieuw afspelen vanaf het begin"
                  : "Automatisch afspelen"
              }
              onClick={() => {
                if (isPlaying) {
                  setIsPlaying(false);
                  return;
                }
                if (previewLine.length <= 1) return;
                if (previewIndex >= previewLine.length - 1) {
                  setPreviewIndex(0);
                }
                setIsPlaying(true);
              }}
              disabled={previewLine.length <= 1}
              style={
                isPlaying ? replayNavButtonActiveStyle : replayNavButtonStyle
              }
            >
              {isPlaying ? "⏸" : "⏯"}
            </button>
            <button
              type="button"
              title="Volgende zet"
              disabled={atLast}
              onClick={() => {
                setIsPlaying(false);
                setPreviewIndex((prev) =>
                  Math.min(prev + 1, previewLine.length - 1)
                );
              }}
              style={replayNavButtonStyle}
            >
              ▶
            </button>
            <button
              type="button"
              title="Laatste zet"
              disabled={atLast}
              onClick={() => {
                setIsPlaying(false);
                setPreviewIndex(Math.max(0, previewLine.length - 1));
              }}
              style={replayNavButtonStyle}
            >
              ⏭
            </button>
          </div>
        </div>

        <div style={sidePanelStyle}>
          <section style={cardStyle}>
            <div style={lineSectionHeaderStyle}>
              <div style={sectionTitleStyle}>Preview line</div>
              <div style={viewToggleStyle} role="group" aria-label="Weergave lijn">
                <button
                  type="button"
                  onClick={() => setLineView("list")}
                  style={
                    lineView === "list"
                      ? viewToggleButtonActiveStyle
                      : viewToggleButtonStyle
                  }
                >
                  Lijst
                </button>
                <button
                  type="button"
                  onClick={() => setLineView("text")}
                  style={
                    lineView === "text"
                      ? viewToggleButtonActiveStyle
                      : viewToggleButtonStyle
                  }
                >
                  Tekst
                </button>
              </div>
            </div>

            {previewLine.length === 0 ? (
              <div style={emptyStateStyle}>{uiText(language, "noLineAvailable")}</div>
            ) : lineView === "list" ? (
              <div style={embeddedMoveTextPanelStyle}>
                <SourceMoveTextPanel
                  language={language}
                  document={document}
                  selectedNodeId={previewLine[previewIndex]?.id ?? previewTargetNodeId}
                  onSelectNode={navigateToNode}
                  onMoveVariation={() => undefined}
                />
              </div>
            ) : (
              <PreviewLineReadingText
                document={document}
                language={language}
                activeNodeId={previewLine[previewIndex]?.id ?? previewTargetNodeId}
                onPickVariation={(nodeId) => {
                  navigateToNode(nodeId);
                }}
              />
            )}
          </section>

          <section style={cardStyle}>
            <div style={sectionTitleStyle}>{uiText(language, "currentPreviewNode")}</div>

            {previewNode ? (
              <div style={stackStyle}>
                <InfoRow
                  label="Move"
                  value={
                    previewNode.move
                      ? getDisplayNotation(previewNode)
                      : uiText(language, "sourceRootPosition")
                  }
                />
                <InfoRow label="Ply" value={String(previewNode.plyIndex)} />
                <InfoRow label="Eval" value={getNodeEvalText(previewNode) ?? "—"} />
                <InfoRow label="Glyph" value={previewNode.glyphs?.[0] ?? "—"} />
                <InfoRow
                  label="Pre-move text"
                  value={
                    readText(previewNode.preMoveComment, language)
                      ? uiText(language, "yes")
                      : uiText(language, "no")
                  }
                />
                <InfoRow
                  label="Post-move text"
                  value={
                    readText(previewNode.comment, language)
                      ? uiText(language, "yes")
                      : uiText(language, "no")
                  }
                />
                <InfoRow
                  label="Comment"
                  value={readText(previewNode.comment, language) || "—"}
                />
              </div>
            ) : (
              <div style={emptyStateStyle}>No preview node selected.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function readText(value: any, language: LanguageCode): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.values) return readLocalizedText(value, language);
  return "";
}

function PreviewLineReadingText({
  document,
  language,
  activeNodeId,
  onPickVariation,
}: {
  document: SourceDocument;
  language: LanguageCode;
  activeNodeId: string | null;
  onPickVariation: (nodeId: string) => void;
}) {
  const nodeMap = useMemo(() => buildNodeMap(document), [document]);
  const root = useMemo(
    () => nodeMap.get(document.rootNodeId) ?? null,
    [nodeMap, document.rootNodeId]
  );

  const renderLineFromNode = (startNode: AnalysisNode, pathKey: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    let current: AnalysisNode | undefined = startNode;
    let index = 0;

    while (current) {
      const node = current;
      const keyBase = `${pathKey}-${node.id}-${index}`;
      const pre = readText(node.preMoveComment, language);
      if (pre) {
        parts.push(
          <span key={`${keyBase}-pre`} style={bookPreTextStyle}>
            {pre}{" "}
          </span>
        );
      }

      const isActive = node.id === activeNodeId;
      parts.push(
        <button
          key={`${keyBase}-move`}
          type="button"
          title="Ga naar deze zet"
          onClick={() => onPickVariation(node.id)}
          style={{
            ...bookMoveButtonStyle,
            ...(isActive ? bookMoveButtonActiveStyle : {}),
          }}
        >
          {getDisplayNotation(node)}
        </button>
      );

      const post = readText(node.comment, language);
      if (post) {
        parts.push(
          <span key={`${keyBase}-post`} style={bookPostTextStyle}>
            {" "}
            {post}
          </span>
        );
      }

      const children = getOrderedChildrenFromMap(node, nodeMap);
      const variationChildren = children.slice(1);
      if (variationChildren.length > 0) {
        parts.push(
          <span key={`${keyBase}-vars`} style={bookVariationGroupStyle}>
            {variationChildren.map((variation, varIndex) => (
              <span key={`${keyBase}-var-${variation.id}-${varIndex}`}>
                {" "}
                (<span style={bookVariationTextStyle}>
                  {renderLineFromNode(variation, `${keyBase}-varline-${varIndex}`)}
                </span>)
              </span>
            ))}
          </span>
        );
      }

      parts.push(<span key={`${keyBase}-sp`}> </span>);
      current = children[0];
      index += 1;
    }

    return parts;
  };

  if (!root) {
    return (
      <div style={bookEmptyStyle}>
        Geen zetten beschikbaar.
      </div>
    );
  }

  const rootChildren = getOrderedChildrenFromMap(root, nodeMap);
  if (rootChildren.length === 0) {
    return (
      <div style={bookEmptyStyle}>
        Geen zetten op deze lijn — alleen de startpositie.
      </div>
    );
  }

  const mainlineStart = rootChildren[0];
  const expandedSegments = renderLineFromNode(mainlineStart, "root-mainline");
  return <div style={bookReadingWrapStyle}>{expandedSegments}</div>;
}

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={metaCardStyle}>
      <div style={metaLabelStyle}>{label}</div>
      <div style={metaValueStyle}>{value}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  flex: "1 1 0",
  padding: 18,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 16,
  minHeight: 0,
  minWidth: 0,
  height: "100%",
  boxSizing: "border-box",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const headerTitleBlockStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const titleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "#111827",
};

const metaWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const metaCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  background: "#fff",
  padding: "10px 12px",
  minWidth: 100,
};

const metaLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
  marginBottom: 4,
};

const metaValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#111827",
};

const contentStyle: CSSProperties = {
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 420px)",
  gap: 14,
  alignItems: "stretch",
};

const boardColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  boxSizing: "border-box",
  overflow: "hidden",
};

const previewBoardAreaStyle: CSSProperties = {
  flex: "1 1 0",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const replayNavBarStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  gap: 6,
  marginBottom: 8,
};

const replayNavButtonStyle: CSSProperties = {
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

const replayNavButtonActiveStyle: CSSProperties = {
  ...replayNavButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const sidePanelStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  display: "grid",
  alignContent: "start",
  gap: 12,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
  display: "grid",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
};

const lineSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const viewToggleStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  overflow: "hidden",
  flexShrink: 0,
};

const viewToggleButtonStyle: CSSProperties = {
  border: "none",
  margin: 0,
  padding: "8px 14px",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
  color: "#64748b",
};

const viewToggleButtonActiveStyle: CSSProperties = {
  ...viewToggleButtonStyle,
  background: "#eff6ff",
  color: "#1d4ed8",
};

const bookReadingWrapStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.75,
  color: "#1e293b",
  textAlign: "left",
  hyphens: "auto",
};

const bookPreTextStyle: CSSProperties = {
  color: "#64748b",
  fontStyle: "italic",
};

const bookPostTextStyle: CSSProperties = {
  color: "#475569",
};

const bookMoveButtonStyle: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontWeight: 700,
  color: "#0f172a",
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationColor: "rgba(15,23,42,0.25)",
  textUnderlineOffset: 3,
};

const bookMoveButtonActiveStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecorationColor: "rgba(37,99,235,0.45)",
};

const bookVariationGroupStyle: CSSProperties = {
  whiteSpace: "normal",
};

const bookVariationTextStyle: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontStyle: "italic",
  fontWeight: 500,
  color: "#6d28d9",
};

const bookEmptyStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.5,
  fontStyle: "italic",
};

const embeddedMoveTextPanelStyle: CSSProperties = {
  minHeight: 0,
  height: "min(58vh, 620px)",
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const infoRowStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111827",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const emptyStateStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.45,
};