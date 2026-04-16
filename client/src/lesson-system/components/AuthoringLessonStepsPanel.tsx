import type { CSSProperties } from "react";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { SourceDocument } from "../types/analysisTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import { useMemo, useState } from "react";
import SourceMoveTextPanel from "./SourceMoveTextPanel";
import SourceBoardSurface from "./SourceBoardSurface";

type Props = {
  orderedSteps: AuthoringLessonStep[];
  selectedStepId: string | null;
  language: LanguageCode;
  onSelectStep: (stepId: string) => void;
  onInsertStepAfter: () => void;
  onInsertStepBefore: () => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onMoveStepUp: () => void;
  onMoveStepDown: () => void;
  onRenameStepTitle: (stepId: string, title: string) => void;
  sources: SourceDocument[];
  onImportFromSource: (args: {
    sourceId: string;
    startNodeId: string;
    endNodeId: string;
    importTarget: "showMoves" | "showLine" | "askSequence";
    importMode: "singleStep" | "stepPerMove";
    includeVariationsAsBranches: boolean;
    lineNodeIds?: string[];
    lineMode?: "mainline" | "variation" | "custom";
  }) => void;
  canDelete: boolean;
};

export default function AuthoringLessonStepsPanel({
  orderedSteps,
  selectedStepId,
  language,
  onSelectStep,
  onInsertStepAfter,
  onInsertStepBefore,
  onDuplicateStep,
  onDeleteStep,
  onMoveStepUp,
  onMoveStepDown,
  onRenameStepTitle,
  sources,
  onImportFromSource,
  canDelete,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [importOpen, setImportOpen] = useState(false);
  const [sourceId, setSourceId] = useState<string>("");
  const [startNodeId, setStartNodeId] = useState<string>("");
  const [endNodeId, setEndNodeId] = useState<string>("");
  const [pickerNodeId, setPickerNodeId] = useState<string>("");
  const [pickTarget, setPickTarget] = useState<"start" | "end">("start");
  const [sourceQuery, setSourceQuery] = useState("");
  const [importTarget, setImportTarget] = useState<"showMoves" | "showLine" | "askSequence">("showMoves");
  const [importMode, setImportMode] = useState<"singleStep" | "stepPerMove">("singleStep");
  const [includeVariationsAsBranches, setIncludeVariationsAsBranches] = useState(true);

  const activeSource = useMemo(
    () => sources.find((s) => s.id === sourceId) ?? null,
    [sources, sourceId]
  );
  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => {
      const title = readLocalizedText(s.title, language).toLowerCase();
      const white = s.sourceMeta?.white?.toLowerCase() ?? "";
      const black = s.sourceMeta?.black?.toLowerCase() ?? "";
      const event = s.sourceMeta?.event?.toLowerCase() ?? "";
      return title.includes(q) || white.includes(q) || black.includes(q) || event.includes(q);
    });
  }, [sourceQuery, sources, language]);

  const nodeMap = useMemo(
    () => new Map((activeSource?.nodes ?? []).map((n) => [n.id, n] as const)),
    [activeSource]
  );

  const lineNodes = useMemo(() => {
    if (!activeSource) return [];
    const out: SourceDocument["nodes"] = [];
    let cur = nodeMap.get(activeSource.rootNodeId);
    while (cur) {
      const next = (cur.childrenIds ?? [])
        .map((id) => nodeMap.get(id))
        .filter((n): n is SourceDocument["nodes"][number] => !!n)
        .sort((a, b) => {
          const aMain = a.isMainline !== false ? 0 : 1;
          const bMain = b.isMainline !== false ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          return a.plyIndex - b.plyIndex;
        })[0];
      if (!next) break;
      out.push(next);
      cur = next;
    }
    return out;
  }, [activeSource, nodeMap]);

  const pickerNode = pickerNodeId ? nodeMap.get(pickerNodeId) ?? null : null;
  const pickerFen = pickerNode?.fenAfter ?? activeSource?.initialFen ?? "";

  const buildPathToRoot = (nodeId: string): string[] => {
    const path: string[] = [];
    let current: string | null = nodeId;
    while (current) {
      const n = nodeMap.get(current);
      if (!n) break;
      path.push(n.id);
      current = n.parentId ?? null;
    }
    return path.reverse();
  };

  const nodeLabel = (n: SourceDocument["nodes"][number]) =>
    `${n.move?.notation ?? "root"} (P${n.plyIndex})`;

  return (
    <div style={rootStyle}>
      <div style={topPinnedStyle}>
        <div style={headerStyle}>
          <strong>{t("Authoring steps", "Authoring-stappen")}</strong>
        </div>

        <div style={toolbarStyle}>
          <button type="button" style={btnStyle} onClick={onInsertStepBefore}>
            {t("↖ + Step before", "↖ + Stap ervoor")}
          </button>
          <button type="button" style={btnStyle} onClick={onInsertStepAfter}>
            {t("↘ + Step after", "↘ + Stap erna")}
          </button>
          <button type="button" style={btnStyle} onClick={onDuplicateStep} disabled={!selectedStepId}>
            {t("⧉ Duplicate", "⧉ Dupliceren")}
          </button>
          <button type="button" style={btnStyle} onClick={onMoveStepUp} disabled={!selectedStepId}>
            {t("↑ Up", "↑ Omhoog")}
          </button>
          <button type="button" style={btnStyle} onClick={onMoveStepDown} disabled={!selectedStepId}>
            {t("↓ Down", "↓ Omlaag")}
          </button>
          <button
            type="button"
            style={{ ...btnStyle, color: canDelete ? "#b91c1c" : "#94a3b8" }}
            onClick={onDeleteStep}
            disabled={!selectedStepId || !canDelete}
          >
            {t("× Delete", "× Verwijderen")}
          </button>
        </div>

        <div style={importWrapStyle}>
          <div style={importHeadStyle}>
            <strong>{t("Import from source", "Importeer vanuit bron")}</strong>
            <button type="button" style={btnStyle} onClick={() => setImportOpen((v) => !v)}>
              {importOpen ? t("Hide", "Verberg") : t("Show", "Toon")}
            </button>
          </div>
          {importOpen ? (
            <div style={importBodyStyle}>
            <select
              style={selectStyle}
              value={sourceId}
              onChange={(e) => {
                const id = e.target.value;
                setSourceId(id);
                setStartNodeId("");
                setEndNodeId("");
                const rootId = sources.find((s) => s.id === id)?.rootNodeId ?? "";
                setPickerNodeId(rootId);
              }}
            >
              <option value="">{t("Select source", "Kies bron")}</option>
              {filteredSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {readLocalizedText(s.title, language)}
                </option>
              ))}
            </select>
            <input
              style={selectStyle}
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              placeholder={t("Filter source", "Filter bron")}
            />
            <div style={importGridStyle}>
              <button
                type="button"
                style={pickTarget === "start" ? pickTargetActiveStyle : btnStyle}
                onClick={() => setPickTarget("start")}
              >
                {t("Pick start", "Kies start")}
              </button>
              <button
                type="button"
                style={pickTarget === "end" ? pickTargetActiveStyle : btnStyle}
                onClick={() => setPickTarget("end")}
              >
                {t("Pick end", "Kies eind")}
              </button>
            </div>
            <div style={importGridStyle}>
              <select
                style={selectStyle}
                value={startNodeId}
                onChange={(e) => setStartNodeId(e.target.value)}
                disabled={!activeSource}
              >
                <option value="">{t("Start node", "Start node")}</option>
                {lineNodes.map((n) => (
                  <option key={`s-${n.id}`} value={n.id}>
                    {nodeLabel(n)}
                  </option>
                ))}
              </select>
              <select
                style={selectStyle}
                value={endNodeId}
                onChange={(e) => setEndNodeId(e.target.value)}
                disabled={!activeSource}
              >
                <option value="">{t("End node", "Eind node")}</option>
                {lineNodes.map((n) => (
                  <option key={`e-${n.id}`} value={n.id}>
                    {nodeLabel(n)}
                  </option>
                ))}
              </select>
            </div>
            <div style={importGridStyle}>
              <select
                style={selectStyle}
                value={importTarget}
                onChange={(e) => {
                  const nextTarget = e.target.value as "showMoves" | "showLine" | "askSequence";
                  setImportTarget(nextTarget);
                  if (nextTarget === "askSequence") setImportMode("singleStep");
                }}
              >
                <option value="showMoves">{t("Target: show moves", "Doel: toon zetten")}</option>
                <option value="showLine">{t("Target: show line", "Doel: toon lijn")}</option>
                <option value="askSequence">{t("Target: sequence", "Doel: sequence")}</option>
              </select>
              <select
                style={selectStyle}
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "singleStep" | "stepPerMove")}
                disabled={importTarget === "askSequence"}
              >
                <option value="singleStep">{t("Import as one step", "Importeer als 1 stap")}</option>
                <option value="stepPerMove">{t("Import per move", "Importeer per zet")}</option>
              </select>
              <label style={checkStyle}>
                <input
                  type="checkbox"
                  checked={includeVariationsAsBranches}
                  onChange={(e) => setIncludeVariationsAsBranches(e.target.checked)}
                />
                {t("Variations as side-branches", "Varianten als zijlijnen")}
              </label>
            </div>
            <div style={sourcePickerPanelStyle}>
              {activeSource ? (
                <div style={sourcePickerContentStyle}>
                  <div style={miniBoardWrapStyle}>
                    <div style={miniBoardInnerStyle}>
                      <SourceBoardSurface
                        fen={pickerFen}
                        mode="play"
                        setupBrush="wm"
                        showBoardFrame={false}
                        onMovePlayed={() => undefined}
                        onFenEdited={() => undefined}
                      />
                    </div>
                  </div>
                  <div style={movesListWrapStyle}>
                    <SourceMoveTextPanel
                      language={language}
                      document={activeSource}
                      selectedNodeId={pickerNodeId || activeSource.rootNodeId}
                      defaultDisplay={{
                        showEval: false,
                        showGlyphs: false,
                        showPreTextFlag: false,
                        showPostTextFlag: false,
                      }}
                      hideDisplayToggles
                      hideMetaInfo
                      hideHeader
                      onSelectNode={(nodeId) => {
                        setPickerNodeId(nodeId);
                        if (pickTarget === "start") {
                          setStartNodeId(nodeId);
                          if (!endNodeId) setPickTarget("end");
                        } else {
                          setEndNodeId(nodeId);
                        }
                      }}
                      onMoveVariation={() => undefined}
                    />
                  </div>
                </div>
              ) : (
                <div style={emptyPickerStyle}>{t("Select source first", "Selecteer eerst een bron")}</div>
              )}
            </div>
              <button
                type="button"
                style={btnStyle}
                disabled={!sourceId || !startNodeId || !endNodeId}
                onClick={() =>
                  (() => {
                    const endPath = endNodeId ? buildPathToRoot(endNodeId) : [];
                    const startPath = startNodeId ? buildPathToRoot(startNodeId) : [];
                    const pathNodeIds = endPath.includes(startNodeId)
                      ? endPath
                      : startPath.includes(endNodeId)
                        ? startPath
                        : [];
                    const nonRootPath = pathNodeIds.filter(
                      (nodeId) => nodeId !== (activeSource?.rootNodeId ?? "")
                    );
                  onImportFromSource({
                    sourceId,
                    startNodeId,
                    endNodeId,
                    importTarget,
                    importMode,
                    includeVariationsAsBranches,
                    lineNodeIds: nonRootPath.length ? nonRootPath : undefined,
                    lineMode: nonRootPath.length ? "custom" : "mainline",
                  });
                  })()
                }
              >
                {t("Import", "Importeer")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ul style={listStyle}>
        {orderedSteps.map((step, index) => {
          const active = step.id === selectedStepId;
          const label =
            readLocalizedText(step.title, language).trim() ||
            readLocalizedText(step.shortTitle, language).trim() ||
            `${step.kind} #${index + 1}`;
          return (
            <li key={step.id} style={{ margin: 0 }}>
              <button
                type="button"
                onClick={() => onSelectStep(step.id)}
                style={{
                  ...stepBtnStyle,
                  border: active ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  background: active ? "#eff6ff" : "#fff",
                }}
              >
                <span style={stepIndexStyle}>{index + 1}.</span> {label}
              </button>
              {active ? (
                <input
                  style={titleInputStyle}
                  value={readLocalizedText(step.title, language)}
                  placeholder={t("Step title", "Staptitel")}
                  onChange={(e) => onRenameStepTitle(step.id, e.target.value)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 0,
  padding: 10,
  boxSizing: "border-box",
};

const topPinnedStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  background: "#fff",
  paddingBottom: 8,
  display: "grid",
  gap: 8,
};

const headerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const btnStyle: CSSProperties = {
  fontSize: 11,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  overflow: "auto",
  flex: 1,
  paddingTop: 2,
};

const stepBtnStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  cursor: "pointer",
};

const stepIndexStyle: CSSProperties = {
  color: "#64748b",
  fontWeight: 700,
  marginRight: 4,
};

const titleInputStyle: CSSProperties = {
  marginTop: 6,
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};

const importWrapStyle: CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  paddingTop: 8,
  display: "grid",
  gap: 8,
};

const importHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 12,
};

const importBodyStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const importGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const selectStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#fff",
};

const checkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: "#475569",
};

const sourcePickerPanelStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  background: "#f8fafc",
  minHeight: 180,
};

const sourcePickerContentStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
  padding: 6,
};

const miniBoardWrapStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 4,
  background: "#fff",
  display: "flex",
  justifyContent: "center",
};

const miniBoardInnerStyle: CSSProperties = {
  width: "min(100%, 320px)",
  aspectRatio: "1 / 1",
  overflow: "hidden",
};

const movesListWrapStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: 4,
  maxHeight: 260,
  overflow: "auto",
};

const emptyPickerStyle: CSSProperties = {
  padding: 10,
  fontSize: 12,
  color: "#64748b",
};

const pickTargetActiveStyle: CSSProperties = {
  ...btnStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};
