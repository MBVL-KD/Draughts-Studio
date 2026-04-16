import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MoveGlyph, SourceDocument } from "../types/analysisTypes";
import type { SourceEditorState } from "../source-editor/sourceEditorReducer";
import { sourceEditorReducer } from "../source-editor/sourceEditorReducer";
import {
  selectCurrentFen,
  selectSelectedNode,
} from "../source-editor/sourceEditorSelectors";
import type { SourceBoardMoveEvent } from "../source-editor/sourceBoardTypes";
import type { SourceBoardMode } from "../source-editor/sourceBoardTypes";

import SourceBoardWorkspace, {
  type SourceBoardWorkspaceHandle,
} from "./SourceBoardWorkspace";
import SourceMoveTextPanel from "./SourceMoveTextPanel";
import SourceNodeInspector from "./SourceNodeInspector";
import SourceImportPanel from "./SourceImportPanel";
import SourcePreviewPanel from "./SourcePreviewPanel";
import type { LanguageCode } from "../types/i18nTypes";
import { uiText } from "../i18n/studioUiText";

type Props = {
  initialDocument?: SourceDocument | null;
  onDocumentChange?: (document: SourceDocument) => void;
  onImportAdditionalPdnChunks?: (pdnChunks: string[]) => void;
  language?: LanguageCode;
};

type SourceEditorTab = "board" | "setup" | "import" | "preview";

function createFallbackSource(): SourceDocument {
  const now = new Date().toISOString();

  return {
    id: "fallback-source",
    kind: "analysis",
    format: "manual",
    title: {
      values: {
        en: "Fallback source",
        nl: "Fallback bron",
      },
    },
    description: {
      values: {
        en: "",
        nl: "",
      },
    },
    variantId: "international",
    initialFen: "W:W:B",
    rootNodeId: "fallback-root",
    nodes: [
      {
        id: "fallback-root",
        parentId: null,
        childrenIds: [],
        variationOf: null,
        isMainline: true,
        plyIndex: 0,
        fenAfter: "W:W:B",
        glyphs: [],
        labels: [],
        highlights: [],
        arrows: [],
        routes: [],
      },
    ],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function getSelectedNodeTitle(
  node: ReturnType<typeof selectSelectedNode>,
  language: LanguageCode
): string {
  if (!node) return uiText(language, "sourceNoNodeSelected");
  if (node.plyIndex === 0) return uiText(language, "sourceRootPosition");
  return node.move?.notation || `${uiText(language, "sourcePly")} ${node.plyIndex}`;
}

function canUseGlobalHotkeys() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return false;
  if (el.isContentEditable) return false;
  return true;
}

function getNodeById(document: SourceDocument, nodeId: string | null): SourceDocument["nodes"][number] | null {
  if (!nodeId) return null;
  return document.nodes.find((node) => node.id === nodeId) ?? null;
}

function getOrderedChildren(document: SourceDocument, parentId: string | null): SourceDocument["nodes"] {
  if (!parentId) return [];
  const parent = getNodeById(document, parentId);
  if (!parent) return [];
  return (parent.childrenIds ?? [])
    .map((id) => getNodeById(document, id))
    .filter((node): node is SourceDocument["nodes"][number] => !!node)
    .sort((a, b) => {
      const aMain = a.isMainline !== false ? 0 : 1;
      const bMain = b.isMainline !== false ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      return a.plyIndex - b.plyIndex;
    });
}

function getSourceMetaSummary(document: SourceDocument): string {
  const white = document.sourceMeta?.white?.trim();
  const black = document.sourceMeta?.black?.trim();
  const result = document.sourceMeta?.result?.trim();
  if (!white && !black && !result) return "";
  const names =
    white && black
      ? `${white} - ${black}`
      : white
      ? white
      : black
      ? black
      : "";
  return result ? `${names} (${result})` : names;
}

export default function SourceEditorPage({
  initialDocument,
  onDocumentChange,
  onImportAdditionalPdnChunks,
  language = "nl",
}: Props) {
  const onDocumentChangeRef = useRef<Props["onDocumentChange"]>(onDocumentChange);
  const safeInitialDocument = useMemo<SourceDocument>(() => {
    if (
      initialDocument &&
      Array.isArray(initialDocument.nodes) &&
      initialDocument.nodes.length > 0 &&
      typeof initialDocument.rootNodeId === "string"
    ) {
      return initialDocument;
    }

    return createFallbackSource();
  }, [initialDocument]);

  const initialState = useMemo<SourceEditorState>(
    () => ({
      initialDocument: safeInitialDocument,
      document: safeInitialDocument,
      selectedNodeId:
        safeInitialDocument.rootNodeId ??
        safeInitialDocument.nodes[0]?.id ??
        null,
      lastImportSummary: null,
    }),
    [safeInitialDocument]
  );

  const [tab, setTab] = useState<SourceEditorTab>("board");
  const boardWorkspaceRef = useRef<SourceBoardWorkspaceHandle>(null);
  const [showMoveTextPanel, setShowMoveTextPanel] = useState(true);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);
  const [state, dispatch] = useReducer(sourceEditorReducer, initialState);

  const selectedNode = useMemo(() => selectSelectedNode(state), [state]);
  const currentFen = useMemo(() => selectCurrentFen(state), [state]);
  const sourceMetaSummary = useMemo(
    () => getSourceMetaSummary(state.document),
    [state.document]
  );

  const boardMode: SourceBoardMode = tab === "setup" ? "setup" : "play";

  const handlePlayMove = (event: SourceBoardMoveEvent) => {
    dispatch({
      type: "APPLY_MOVE_AT_SELECTED_NODE",
      move: event.move,
      fenAfter: event.fenAfter,
    });
  };

  const handleEditFen = (fen: string) => {
    dispatch({
      type: "SET_ROOT_FEN",
      fen,
    });
  };

  const splitPdnIntoGames = (pdn: string): string[] => {
    const text = pdn.trim();
    if (!text) return [];
    const starts: number[] = [];
    const regex = /^\s*\[Event\s+"[^"]*"\s*\]/gm;
    let match: RegExpExecArray | null = regex.exec(text);
    while (match) {
      starts.push(match.index);
      match = regex.exec(text);
    }
    if (starts.length <= 1) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < starts.length; i += 1) {
      const start = starts[i]!;
      const end = i + 1 < starts.length ? starts[i + 1]! : text.length;
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks.length ? chunks : [text];
  };

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onDocumentChangeRef.current?.(state.document);
  }, [state.document]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canUseGlobalHotkeys()) return;
      const selected = getNodeById(state.document, state.selectedNodeId);
      if (!selected) return;

      if (event.key === "ArrowLeft") {
        if (selected.parentId) {
          event.preventDefault();
          dispatch({ type: "SELECT_NODE", nodeId: selected.parentId });
        }
        return;
      }

      if (event.key === "ArrowRight") {
        const firstChild = getOrderedChildren(state.document, selected.id)[0];
        if (firstChild) {
          event.preventDefault();
          if (
            (tab === "board" || tab === "setup") &&
            boardWorkspaceRef.current?.navigateMainChildForward()
          ) {
            return;
          }
          dispatch({ type: "SELECT_NODE", nodeId: firstChild.id });
        }
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (!selected.parentId) return;
        const siblings = getOrderedChildren(state.document, selected.parentId);
        const index = siblings.findIndex((item) => item.id === selected.id);
        if (index < 0) return;

        const nextIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
        const next = siblings[nextIndex];
        if (!next) return;

        event.preventDefault();
        dispatch({ type: "SELECT_NODE", nodeId: next.id });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.document, state.selectedNodeId, tab]);

  const analysisLayoutColumns = useMemo(() => {
    if (showMoveTextPanel && showInspectorPanel) {
      return "minmax(0, 2.3fr) 440px 290px";
    }
    if (showMoveTextPanel && !showInspectorPanel) {
      return "minmax(0, 2.3fr) 440px";
    }
    if (!showMoveTextPanel && showInspectorPanel) {
      return "minmax(0, 1fr) 290px";
    }
    return "minmax(0, 1fr)";
  }, [showInspectorPanel, showMoveTextPanel]);

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
      <div style={tabsBarStyle}>
        <div style={tabsLeftStyle}>
          <TabButton active={tab === "board"} onClick={() => setTab("board")}>
            {uiText(language, "sourceTabAnalyze")}
          </TabButton>
          <TabButton active={tab === "setup"} onClick={() => setTab("setup")}>
            {uiText(language, "sourceTabSetup")}
          </TabButton>
          <TabButton active={tab === "import"} onClick={() => setTab("import")}>
            {uiText(language, "sourceTabImport")}
          </TabButton>
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            {uiText(language, "sourceTabPreview")}
          </TabButton>
          {tab === "board" || tab === "setup" ? (
            <>
              <TabButton
                active={showMoveTextPanel}
                onClick={() => setShowMoveTextPanel((prev) => !prev)}
              >
                {showMoveTextPanel
                  ? uiText(language, "sourceHideMovetext")
                  : uiText(language, "sourceShowMovetext")}
              </TabButton>
              <TabButton
                active={showInspectorPanel}
                onClick={() => setShowInspectorPanel((prev) => !prev)}
              >
                {showInspectorPanel
                  ? uiText(language, "sourceHideInspector")
                  : uiText(language, "sourceShowInspector")}
              </TabButton>
            </>
          ) : null}
        </div>

        <div style={tabsStatusStyle}>
          {getSelectedNodeTitle(selectedNode, language)}
          {sourceMetaSummary ? ` • ${sourceMetaSummary}` : ""}
        </div>
      </div>

      {tab === "board" || tab === "setup" ? (
        <div style={{ ...analysisLayoutStyle, gridTemplateColumns: analysisLayoutColumns }}>
          <section style={workspaceColumnStyle}>
            <SourceBoardWorkspace
              ref={boardWorkspaceRef}
              language={language}
              document={state.document}
              selectedNodeId={state.selectedNodeId}
              currentFen={currentFen}
              mode={boardMode}
              onSelectNode={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId })}
              onPlayMove={handlePlayMove}
              onEditFen={handleEditFen}
              onEngineSnapshot={(engine) =>
                dispatch({ type: "UPDATE_SELECTED_NODE_ENGINE", engine })
              }
              onUpdateNodeOverlays={(patch) =>
                dispatch({
                  type: "UPDATE_SELECTED_NODE_OVERLAYS",
                  ...patch,
                })
              }
            />
          </section>

          {showMoveTextPanel ? (
            <aside className="smart-scroll" style={moveTextColumnStyle}>
              <SourceMoveTextPanel
                language={language}
                document={state.document}
                selectedNodeId={state.selectedNodeId}
                onSelectNode={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId })}
                onMoveVariation={(nodeId, direction) =>
                  dispatch({ type: "MOVE_VARIATION", nodeId, direction })
                }
              />
            </aside>
          ) : null}

          {showInspectorPanel ? (
            <aside className="smart-scroll" style={inspectorColumnStyle}>
              <SourceNodeInspector
                language={language}
                node={selectedNode}
                sourceMeta={state.document.sourceMeta}
                onChangeSourceMetaField={(field, value) =>
                  dispatch({
                    type: "UPDATE_SOURCE_META_FIELD",
                    field,
                    value,
                  })
                }
                onChangeGlyph={(glyph: MoveGlyph | "") =>
                  dispatch({
                    type: "UPDATE_SELECTED_NODE_GLYPH",
                    glyph,
                  })
                }
                onChangeComment={(value) =>
                  dispatch({
                    type: "UPDATE_SELECTED_NODE_COMMENT",
                    value,
                  })
                }
                onChangePreMoveComment={(value) =>
                  dispatch({
                    type: "UPDATE_SELECTED_NODE_PREMOVE_COMMENT",
                    value,
                  })
                }
              />
            </aside>
          ) : null}
        </div>
      ) : null}

      {tab === "import" ? (
        <div className="smart-scroll" style={singlePanelStyle}>
          <SourceImportPanel
            language={language}
            importSummary={state.lastImportSummary}
            onImportFen={(fen) =>
              dispatch({
                type: "SET_ROOT_FEN",
                fen,
              })
            }
            onImportPdn={(pdn) => {
              const chunks = splitPdnIntoGames(pdn);
              const [first, ...rest] = chunks;
              if (first) dispatch({ type: "IMPORT_PDN_TEXT", pdn: first });
              if (rest.length > 0) {
                onImportAdditionalPdnChunks?.(rest);
              }
            }}
          />
        </div>
      ) : null}

      {tab === "preview" ? (
        <div style={previewPanelShellStyle}>
          <div style={previewPanelInnerStyle}>
            <SourcePreviewPanel
              language={language}
              document={state.document}
              selectedNodeId={state.selectedNodeId}
              onSelectNode={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={active ? activeTabButtonStyle : tabButtonStyle}>
      {children}
    </button>
  );
}

const rootStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "56px minmax(0, 1fr)",
  minHeight: "100%",
  height: "100%",
};

const tabsBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  borderBottom: "1px solid #dbe3ec",
  background: "#fcfdff",
};

const tabsLeftStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const tabsStatusStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

const tabButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const activeTabButtonStyle: CSSProperties = {
  ...tabButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const analysisLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2.3fr) 440px 290px",
  minHeight: 0,
  height: "100%",
};

const workspaceColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  borderRight: "1px solid #dbe3ec",
  background: "#fff",
};

const moveTextColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  borderRight: "1px solid #dbe3ec",
  background: "#fff",
};

const inspectorColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  background: "#fbfcfe",
};

const singlePanelStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  background: "#fff",
};

/** Preview needs a bounded flex height so the board scales; import keeps scroll on this shell. */
const previewPanelShellStyle: CSSProperties = {
  ...singlePanelStyle,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const previewPanelInnerStyle: CSSProperties = {
  flex: "1 1 0",
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};