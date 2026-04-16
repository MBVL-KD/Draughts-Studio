import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { AnalysisNode, SourceDocument } from "../types/analysisTypes";
import { buildMoveRows } from "../source-editor/moveTextBuilder";
import type { MoveEntry, MoveRow, VariationBlock } from "../source-editor/moveTextBuilder";
import type { LanguageCode } from "../types/i18nTypes";
import { uiText } from "../i18n/studioUiText";

type Props = {
  document: SourceDocument;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onMoveVariation: (nodeId: string, direction: "up" | "down") => void;
  language?: LanguageCode;
  defaultDisplay?: Partial<MoveTextDisplayOptions>;
  hideDisplayToggles?: boolean;
  hideHeader?: boolean;
  hideMetaInfo?: boolean;
};

type MoveTextDisplayOptions = {
  showEval: boolean;
  showGlyphs: boolean;
  showPreTextFlag: boolean;
  showPostTextFlag: boolean;
};

type ContextMenuState = {
  nodeId: string;
  x: number;
  y: number;
} | null;

// ─── Move button ──────────────────────────────────────────────────────────────

function MoveButton({
  entry,
  side,
  onSelectNode,
  display,
  onOpenContextMenu,
}: {
  entry: MoveEntry;
  side: "white" | "black";
  onSelectNode: (nodeId: string) => void;
  display: MoveTextDisplayOptions;
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, nodeId: string) => void;
}) {
  const style = entry.isSelected
    ? selectedMoveStyle
    : side === "white"
    ? whiteMoveStyle
    : blackMoveStyle;

  return (
    <button
      type="button"
      onClick={() => onSelectNode(entry.nodeId)}
      onContextMenu={(event) => onOpenContextMenu(event, entry.nodeId)}
      style={style}
    >
      <span>{entry.notation}</span>
      {display.showEval && entry.engineEvalText ? (
        <span style={evalStyle}>({entry.engineEvalText})</span>
      ) : null}
      {display.showGlyphs && entry.primaryGlyph ? (
        <span style={glyphStyle}>{entry.primaryGlyph}</span>
      ) : null}
      {display.showPostTextFlag && entry.hasComment && (
        <span style={commentDotStyle} title="Has comment">
          💬
        </span>
      )}
      {display.showPreTextFlag && entry.hasPreMoveComment && (
        <span style={commentDotStyle} title="Has pre-move comment">
          📝
        </span>
      )}
      {!display.showEval && entry.hasEngine && (
        <span style={engineDotStyle} title="Has engine data">
          ⚡
        </span>
      )}
    </button>
  );
}

// ─── Variation block ──────────────────────────────────────────────────────────

function VariationRows({
  block,
  onSelectNode,
  onOpenContextMenu,
  display,
  depth,
}: {
  block: VariationBlock;
  onSelectNode: (nodeId: string) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, nodeId: string) => void;
  display: MoveTextDisplayOptions;
  depth: number;
}) {
  if (block.rows.length === 0) return null;

  return (
    <div style={variationBlockStyle(depth)}>
      <div style={variationBarStyle} />
      <div style={variationInnerStyle}>
        {block.rows.map((row) => (
          <MoveRowItem
            key={row.id}
            row={row}
            onSelectNode={onSelectNode}
            onOpenContextMenu={onOpenContextMenu}
            display={display}
            depth={depth}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Single move row ──────────────────────────────────────────────────────────

function MoveRowItem({
  row,
  onSelectNode,
  onOpenContextMenu,
  display,
  depth,
}: {
  row: MoveRow;
  onSelectNode: (nodeId: string) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, nodeId: string) => void;
  display: MoveTextDisplayOptions;
  depth: number;
}) {
  const hasAfterWhiteVars = row.afterWhiteVariations.length > 0;
  const hasAfterBlackVars = row.afterBlackVariations.length > 0;

  return (
    <div style={rowWrapStyle}>
      {/* Main row: number + white + black */}
      <div style={moveRowStyle}>
        <span style={moveNumberStyle}>
          {row.white !== null
            ? `${row.moveNumber}.`
            : `${row.moveNumber}...`}
        </span>

        <span style={moveCellStyle}>
          {row.white ? (
            <MoveButton
              entry={row.white}
              side="white"
              onSelectNode={onSelectNode}
              display={display}
              onOpenContextMenu={onOpenContextMenu}
            />
          ) : null}
        </span>

        <span style={moveCellStyle}>
          {row.black ? (
            <MoveButton
              entry={row.black}
              side="black"
              onSelectNode={onSelectNode}
              display={display}
              onOpenContextMenu={onOpenContextMenu}
            />
          ) : null}
        </span>
      </div>

      {/* Variations after white's move */}
      {hasAfterWhiteVars && (
        <div style={variationsAreaStyle}>
          {row.afterWhiteVariations.map((block) => (
            <VariationRows
              key={block.id}
              block={block}
              onSelectNode={onSelectNode}
              onOpenContextMenu={onOpenContextMenu}
              display={display}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Variations after black's move */}
      {hasAfterBlackVars && (
        <div style={variationsAreaStyle}>
          {row.afterBlackVariations.map((block) => (
            <VariationRows
              key={block.id}
              block={block}
              onSelectNode={onSelectNode}
              onOpenContextMenu={onOpenContextMenu}
              display={display}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function findSelectedNode(
  document: SourceDocument,
  selectedNodeId: string | null
): AnalysisNode | null {
  if (!selectedNodeId) return null;
  return document.nodes.find((node) => node.id === selectedNodeId) ?? null;
}

export default function SourceMoveTextPanel({
  document,
  selectedNodeId,
  onSelectNode,
  onMoveVariation,
  language = "nl",
  defaultDisplay,
  hideDisplayToggles = false,
  hideHeader = false,
  hideMetaInfo = false,
}: Props) {
  const [display, setDisplay] = useState<MoveTextDisplayOptions>({
    showEval: defaultDisplay?.showEval ?? true,
    showGlyphs: defaultDisplay?.showGlyphs ?? true,
    showPreTextFlag: defaultDisplay?.showPreTextFlag ?? false,
    showPostTextFlag: defaultDisplay?.showPostTextFlag ?? false,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const rows = useMemo(
    () => buildMoveRows(document, selectedNodeId),
    [document, selectedNodeId]
  );

  const selectedNode = useMemo(
    () => findSelectedNode(document, selectedNodeId),
    [document, selectedNodeId]
  );

  const siblingInfo = useMemo(() => {
    if (!contextMenu) return null;
    const node = document.nodes.find((item) => item.id === contextMenu.nodeId);
    if (!node?.parentId) return null;
    const parent = document.nodes.find((item) => item.id === node.parentId);
    if (!parent) return null;
    const index = parent.childrenIds.indexOf(node.id);
    if (index < 0) return null;
    return {
      canMoveUp: index > 0,
      canMoveDown: index < parent.childrenIds.length - 1,
    };
  }, [contextMenu, document.nodes]);

  useEffect(() => {
    if (!contextMenu) return;
    const onClose = () => setContextMenu(null);
    window.addEventListener("click", onClose);
    return () => {
      window.removeEventListener("click", onClose);
    };
  }, [contextMenu]);

  return (
    <div style={rootStyle}>
      <style>{`
        .smart-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .smart-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .smart-scroll:hover {
          scrollbar-width: thin;
        }
        .smart-scroll:hover::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .smart-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.45);
          border-radius: 999px;
        }
        .smart-scroll:hover::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      {!hideHeader ? (
        <div style={headerStyle}>
          <div style={headerTitleBlockStyle}>
            <div style={eyebrowStyle}>{uiText(language, "moveText")}</div>
            <div style={titleStyle}>{uiText(language, "mainlineVariations")}</div>
          </div>

          <div style={metaStyle}>
            {!hideDisplayToggles ? (
              <>
                <TogglePill
                  label={uiText(language, "eval")}
                  active={display.showEval}
                  onToggle={() =>
                    setDisplay((prev) => ({ ...prev, showEval: !prev.showEval }))
                  }
                />
                <TogglePill
                  label={uiText(language, "glyph")}
                  active={display.showGlyphs}
                  onToggle={() =>
                    setDisplay((prev) => ({ ...prev, showGlyphs: !prev.showGlyphs }))
                  }
                />
                <TogglePill
                  label="Pre text"
                  active={display.showPreTextFlag}
                  onToggle={() =>
                    setDisplay((prev) => ({
                      ...prev,
                      showPreTextFlag: !prev.showPreTextFlag,
                    }))
                  }
                />
                <TogglePill
                  label="Post text"
                  active={display.showPostTextFlag}
                  onToggle={() =>
                    setDisplay((prev) => ({
                      ...prev,
                      showPostTextFlag: !prev.showPostTextFlag,
                    }))
                  }
                />
              </>
            ) : null}
            {!hideMetaInfo ? (
              <>
                <div style={metaItemStyle}>
                  <span style={metaLabelStyle}>{uiText(language, "nodes")}</span>
                  <span style={metaValueStyle}>{document.nodes.length}</span>
                </div>
                <div style={metaItemStyle}>
                  <span style={metaLabelStyle}>{uiText(language, "selected")}</span>
                  <span style={metaValueStyle}>
                    {selectedNode?.move?.notation ??
                      (selectedNode ? uiText(language, "sourceRootPosition") : "—")}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="smart-scroll" style={scrollStyle}>
        {rows.length === 0 ? (
          <div style={emptyStateStyle}>
            <div style={emptyTitleStyle}>{uiText(language, "noMovesYet")}</div>
            <div style={emptyTextStyle}>
              Play moves on the board and the main line appears here.
            </div>
          </div>
        ) : (
          <div style={moveListStyle}>
            {rows.map((row) => (
              <MoveRowItem
                key={row.id}
                row={row}
                onSelectNode={onSelectNode}
                onOpenContextMenu={(event, nodeId) => {
                  event.preventDefault();
                  setContextMenu({ nodeId, x: event.clientX, y: event.clientY });
                }}
                display={display}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <div
          style={{
            ...contextMenuStyle,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            style={menuItemStyle}
            disabled={!siblingInfo?.canMoveUp}
            onClick={() => {
              if (!siblingInfo?.canMoveUp) return;
              onMoveVariation(contextMenu.nodeId, "up");
              setContextMenu(null);
            }}
          >
            {uiText(language, "moveUp")}
          </button>
          <button
            type="button"
            style={menuItemStyle}
            disabled={!siblingInfo?.canMoveDown}
            onClick={() => {
              if (!siblingInfo?.canMoveDown) return;
              onMoveVariation(contextMenu.nodeId, "down");
              setContextMenu(null);
            }}
          >
            {uiText(language, "moveDown")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TogglePill({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={active ? activeTogglePillStyle : togglePillStyle}
    >
      {label}
    </button>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  background: "#fff",
};

const headerStyle: CSSProperties = {
  borderBottom: "1px solid #dbe3ec",
  background: "#fcfdff",
  padding: "10px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const headerTitleBlockStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const metaStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const metaItemStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  padding: "5px 8px",
  minWidth: 60,
};

const metaLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#9ca3af",
  marginBottom: 2,
};

const metaValueStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#111827",
};

const scrollStyle: CSSProperties = {
  overflowY: "auto",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  padding: "10px 12px",
  boxSizing: "border-box",
};

const moveListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

// ─── Row styles ───────────────────────────────────────────────────────────────

const rowWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const moveRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 0,
  minHeight: 30,
};

const moveNumberStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#9ca3af",
  minWidth: 32,
  flexShrink: 0,
  paddingLeft: 2,
  fontVariantNumeric: "tabular-nums",
};

const moveCellStyle: CSSProperties = {
  minWidth: 80,
};

// ─── Move button styles ───────────────────────────────────────────────────────

const baseMoveStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  borderRadius: 6,
  padding: "3px 7px",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  transition: "background 0.1s",
  fontVariantNumeric: "tabular-nums",
};

const whiteMoveStyle: CSSProperties = {
  ...baseMoveStyle,
  color: "#111827",
};

const blackMoveStyle: CSSProperties = {
  ...baseMoveStyle,
  color: "#374151",
};

const selectedMoveStyle: CSSProperties = {
  ...baseMoveStyle,
  color: "#1d4ed8",
  background: "#eff6ff",
  boxShadow: "0 0 0 1.5px rgba(37,99,235,0.25)",
};

const glyphStyle: CSSProperties = {
  fontWeight: 800,
  color: "#b45309",
  fontSize: 12,
};

const evalStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 700,
};

const commentDotStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
};

const engineDotStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
};

const togglePillStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 999,
  background: "#fff",
  color: "#374151",
  fontSize: 11,
  fontWeight: 800,
  padding: "4px 8px",
  cursor: "pointer",
};

const activeTogglePillStyle: CSSProperties = {
  ...togglePillStyle,
  border: "1px solid #2563eb",
  color: "#1d4ed8",
  background: "#eff6ff",
};

// ─── Variation styles ─────────────────────────────────────────────────────────

const variationsAreaStyle: CSSProperties = {
  paddingLeft: 32,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

function variationBlockStyle(_depth: number): CSSProperties {
  return {
    display: "flex",
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
    paddingTop: 2,
    paddingBottom: 2,
  };
}

const variationBarStyle: CSSProperties = {
  width: 2,
  borderRadius: 2,
  background: "#c7d2fe",
  flexShrink: 0,
  alignSelf: "stretch",
  minHeight: 16,
};

const variationInnerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};

const contextMenuStyle: CSSProperties = {
  position: "fixed",
  zIndex: 50,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.18)",
  padding: 6,
  display: "grid",
  gap: 4,
  minWidth: 140,
};

const menuItemStyle: CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 10px",
  cursor: "pointer",
};

// ─── Empty state ──────────────────────────────────────────────────────────────

const emptyStateStyle: CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 6,
};

const emptyTextStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "#6b7280",
};