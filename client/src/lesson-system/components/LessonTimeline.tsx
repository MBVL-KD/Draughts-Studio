import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { STEP_TYPE_REGISTRY } from "../registry/stepTypeRegistry";
import type { LessonStep, LessonStepType } from "../types/stepTypes";
import type { LanguageCode, LocalizedText } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import type { SourceDocument } from "../types/analysisTypes";
import SourceMoveTextPanel from "./SourceMoveTextPanel";
import SourceBoardSurface from "./SourceBoardSurface";

type Props = {
  steps: LessonStep[];
  selectedStepId: string | null;
  sources: SourceDocument[];
  defaultSourceId?: string | null;
  language: LanguageCode;
  onSelectStep: (stepId: string) => void;
  onAddStep: (type: LessonStepType) => void;
  onAddStepsFromSource: (args: {
    sourceId: string;
    startNodeId: string;
    endNodeId: string;
    stepType: LessonStepType;
    lineNodeIds?: string[];
    lineMode?: "mainline" | "variation" | "custom";
  }) => void;
  onMoveStepUp: (stepId: string) => void;
  onMoveStepDown: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
};

export default function LessonTimeline({
  steps,
  selectedStepId,
  sources,
  defaultSourceId = null,
  language,
  onSelectStep,
  onAddStep,
  onAddStepsFromSource,
  onMoveStepUp,
  onMoveStepDown,
  onDeleteStep,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const stepTypes = Object.entries(STEP_TYPE_REGISTRY) as Array<
    [LessonStepType, { label: LocalizedText; description: LocalizedText }]
  >;
  const [bulkSourceId, setBulkSourceId] = useState<string>(defaultSourceId ?? "");
  const [bulkStartNodeId, setBulkStartNodeId] = useState<string>("");
  const [bulkEndNodeId, setBulkEndNodeId] = useState<string>("");
  const [bulkStepType, setBulkStepType] = useState<LessonStepType>("move");
  const [bulkPickerNodeId, setBulkPickerNodeId] = useState<string>("");
  const [bulkPickTarget, setBulkPickTarget] = useState<"start" | "end">("start");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkSourceQuery, setBulkSourceQuery] = useState("");

  const filteredSources = useMemo(() => {
    const query = bulkSourceQuery.trim().toLowerCase();
    if (!query) return sources;
    return sources.filter((source) => {
      const title = readLocalizedText(source.title, language).toLowerCase();
      const white = source.sourceMeta?.white?.toLowerCase() ?? "";
      const black = source.sourceMeta?.black?.toLowerCase() ?? "";
      const event = source.sourceMeta?.event?.toLowerCase() ?? "";
      return (
        title.includes(query) ||
        white.includes(query) ||
        black.includes(query) ||
        event.includes(query)
      );
    });
  }, [bulkSourceQuery, sources, language]);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === bulkSourceId) ?? null,
    [sources, bulkSourceId]
  );

  const activeSourceNodeMap = useMemo(
    () => new Map((activeSource?.nodes ?? []).map((node) => [node.id, node] as const)),
    [activeSource]
  );

  const selectedStartNode = bulkStartNodeId
    ? activeSourceNodeMap.get(bulkStartNodeId) ?? null
    : null;
  const selectedEndNode = bulkEndNodeId
    ? activeSourceNodeMap.get(bulkEndNodeId) ?? null
    : null;
  const selectedPickerNode = bulkPickerNodeId
    ? activeSourceNodeMap.get(bulkPickerNodeId) ?? null
    : null;
  const pickerPreviewFen = selectedPickerNode?.fenAfter ?? activeSource?.initialFen ?? "";

  const formatNodeShort = (nodeId: string): string => {
    const node = activeSourceNodeMap.get(nodeId);
    if (!node) return nodeId;
    const notation = node.move?.notation ?? t("Root", "Start");
    return `${notation} (P${node.plyIndex})`;
  };

  const buildPathToRoot = (nodeId: string): string[] => {
    if (!activeSource) return [];
    const path: string[] = [];
    let currentId: string | null = nodeId;
    while (currentId) {
      const node = activeSourceNodeMap.get(currentId);
      if (!node) break;
      path.push(node.id);
      currentId = node.parentId ?? null;
    }
    return path.reverse();
  };

  useEffect(() => {
    if (bulkSourceId && sources.some((source) => source.id === bulkSourceId)) return;
    setBulkSourceId(defaultSourceId ?? sources[0]?.id ?? "");
  }, [defaultSourceId, sources, bulkSourceId]);

  useEffect(() => {
    if (!activeSource) {
      setBulkStartNodeId("");
      setBulkEndNodeId("");
      setBulkPickerNodeId("");
      return;
    }
    const nodes = activeSource.nodes ?? [];
    if (nodes.length === 0) {
      setBulkStartNodeId("");
      setBulkEndNodeId("");
      setBulkPickerNodeId("");
      return;
    }
    if (!bulkPickerNodeId || !activeSourceNodeMap.has(bulkPickerNodeId)) {
      setBulkPickerNodeId(activeSource.rootNodeId);
    }
    if (bulkStartNodeId && !activeSourceNodeMap.has(bulkStartNodeId)) {
      setBulkStartNodeId("");
    }
    if (bulkEndNodeId && !activeSourceNodeMap.has(bulkEndNodeId)) {
      setBulkEndNodeId("");
    }
  }, [activeSource, activeSourceNodeMap, bulkStartNodeId, bulkEndNodeId, bulkPickerNodeId]);

  return (
    <section style={wrapStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>Builder</div>
          <h2 style={titleStyle}>Steps</h2>
        </div>
      </div>

      <div style={blockStyle}>
        <div style={blockTitleStyle}>Add step</div>

        <div style={stepTypeGridStyle}>
          {stepTypes.map(([type, config]) => (
            <button
              key={type}
              type="button"
              onClick={() => onAddStep(type)}
              style={stepTypeButtonStyle}
              title={readLocalizedText(config.description, language)}
            >
              <div style={stepTypeTitleStyle}>
                {readLocalizedText(config.label, language)}
              </div>
              <div style={stepTypeDescStyle}>
                {readLocalizedText(config.description, language)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={blockStyle}>
        <div style={collapsibleHeaderStyle}>
          <div style={blockTitleStyle}>{t("Add from source line", "Toevoegen vanuit bronlijn")}</div>
          <button
            type="button"
            style={collapseButtonStyle}
            onClick={() => setBulkImportOpen((prev) => !prev)}
          >
            {bulkImportOpen ? t("Hide", "Verberg") : t("Show", "Toon")}
          </button>
        </div>
        {bulkImportOpen ? (
          <div style={bulkBuilderStyle}>
            <label style={bulkLabelStyle}>{t("Source", "Bron")}</label>
            <input
              value={bulkSourceQuery}
              onChange={(e) => setBulkSourceQuery(e.target.value)}
              placeholder={t("Filter source by title/player/event", "Filter bron op titel/speler/evenement")}
              style={bulkSelectStyle}
            />
            <select
              value={bulkSourceId}
              onChange={(e) => setBulkSourceId(e.target.value)}
              style={bulkSelectStyle}
              disabled={sources.length === 0}
            >
              {sources.length === 0 ? (
                <option value="">{t("No source", "Geen bron")}</option>
              ) : filteredSources.length === 0 ? (
                <option value="">{t("No source matches filter", "Geen bron voor dit filter")}</option>
              ) : (
                filteredSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {readLocalizedText(source.title, language)}
                  </option>
                ))
              )}
            </select>

            <div style={rangePickerHeaderStyle}>
              <button
                type="button"
                style={bulkPickTarget === "start" ? bulkPickTargetActiveStyle : bulkPickTargetStyle}
                onClick={() => setBulkPickTarget("start")}
              >
                {t("Pick start", "Kies start")}
              </button>
              <button
                type="button"
                style={bulkPickTarget === "end" ? bulkPickTargetActiveStyle : bulkPickTargetStyle}
                onClick={() => setBulkPickTarget("end")}
              >
                {t("Pick end", "Kies eind")}
              </button>
            </div>

            <div style={rangeSummaryStyle}>
              <div>
                <strong>{t("Start", "Start")}:</strong>{" "}
                {selectedStartNode ? formatNodeShort(selectedStartNode.id) : "—"}
              </div>
              <div>
                <strong>{t("End", "Eind")}:</strong>{" "}
                {selectedEndNode ? formatNodeShort(selectedEndNode.id) : "—"}
              </div>
            </div>

            <div style={pickerPanelStyle}>
              {activeSource ? (
                <div style={pickerContentStyle}>
                  <div style={miniBoardWrapStyle}>
                    <div style={miniBoardInnerStyle}>
                      <SourceBoardSurface
                        fen={pickerPreviewFen}
                        mode="play"
                        setupBrush="wm"
                      showBoardFrame={false}
                        onMovePlayed={() => undefined}
                        onFenEdited={() => undefined}
                      />
                    </div>
                  </div>
                  <SourceMoveTextPanel
                    language={language}
                    document={activeSource}
                    selectedNodeId={bulkPickerNodeId || activeSource.rootNodeId}
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
                      setBulkPickerNodeId(nodeId);
                      if (bulkPickTarget === "start") {
                        setBulkStartNodeId(nodeId);
                        if (!bulkEndNodeId) setBulkPickTarget("end");
                      } else {
                        setBulkEndNodeId(nodeId);
                      }
                    }}
                    onMoveVariation={() => undefined}
                  />
                </div>
              ) : (
                <div style={emptyPickerStyle}>{t("Select a source first.", "Selecteer eerst een bron.")}</div>
              )}
            </div>

            <label style={bulkLabelStyle}>{t("Step type", "Staptype")}</label>
            <select
              value={bulkStepType}
              onChange={(e) => setBulkStepType(e.target.value as LessonStepType)}
              style={bulkSelectStyle}
            >
              {stepTypes.map(([type, config]) => (
                <option key={type} value={type}>
                  {readLocalizedText(config.label, language)}
                </option>
              ))}
            </select>

            <button
              type="button"
              style={bulkAddButtonStyle}
              disabled={!bulkSourceId || !bulkStartNodeId || !bulkEndNodeId}
              onClick={() => {
                  const endPath = buildPathToRoot(bulkEndNodeId);
                  const startPath = buildPathToRoot(bulkStartNodeId);
                  const pathNodeIds = endPath.includes(bulkStartNodeId)
                    ? endPath
                    : startPath.includes(bulkEndNodeId)
                    ? startPath
                    : [];
                  const nonRootPath = pathNodeIds.filter(
                    (nodeId) => nodeId !== (activeSource?.rootNodeId ?? "")
                  );
                onAddStepsFromSource({
                  sourceId: bulkSourceId,
                  startNodeId: bulkStartNodeId,
                  endNodeId: bulkEndNodeId,
                  stepType: bulkStepType,
                  lineNodeIds: nonRootPath,
                  lineMode: "custom",
                });
              }}
            >
              {t("+ Add range as steps", "+ Voeg range toe als stappen")}
            </button>
          </div>
        ) : null}
      </div>

      <div style={blockStyle}>
        <div style={blockTitleStyle}>Lesson timeline</div>

        {steps.length === 0 ? (
          <div style={emptyStyle}>This lesson does not have any steps yet.</div>
        ) : (
          <div style={stepsListStyle}>
            {steps.map((step, index) => {
              const isActive = step.id === selectedStepId;
              const stepTypeLabel = readLocalizedText(
                STEP_TYPE_REGISTRY[step.type].label,
                language
              );
              const stepTitle =
                readLocalizedText(step.title, language).trim() ||
                "Untitled step";
              const stepPrompt =
                readLocalizedText(step.prompt, language).trim() ||
                "No prompt entered";

              return (
                <div
                  key={step.id}
                  style={{
                    ...stepCardStyle,
                    ...(isActive ? activeStepCardStyle : null),
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStep(step.id)}
                    style={stepSelectButtonStyle}
                  >
                    <div style={stepMetaStyle}>
                      Step {index + 1} · {stepTypeLabel}
                    </div>

                    <div style={stepTitleStyle}>{stepTitle}</div>

                    <div style={stepPromptStyle}>{stepPrompt}</div>
                  </button>

                  <div style={actionsRowStyle}>
                    <button
                      type="button"
                      onClick={() => onMoveStepUp(step.id)}
                      style={smallButtonStyle}
                    >
                      Up
                    </button>

                    <button
                      type="button"
                      onClick={() => onMoveStepDown(step.id)}
                      style={smallButtonStyle}
                    >
                      Down
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteStep(step.id)}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const wrapStyle: CSSProperties = {
  padding: 18,
  boxSizing: "border-box",
  display: "grid",
  gap: 18,
};

const sectionHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.1,
  color: "#111827",
};

const blockStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const blockTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#374151",
};

const stepTypeGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const bulkBuilderStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  background: "#fff",
  padding: 10,
  display: "grid",
  gap: 8,
};

const bulkLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#6b7280",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const bulkSelectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
};

const bulkAddButtonStyle: CSSProperties = {
  border: "1px solid #2563eb",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  marginTop: 4,
};

const rangePickerHeaderStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const bulkPickTargetStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fff",
  color: "#1f2937",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const bulkPickTargetActiveStyle: CSSProperties = {
  ...bulkPickTargetStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const rangeSummaryStyle: CSSProperties = {
  padding: "4px 2px",
  fontSize: 12,
  color: "#334155",
  display: "grid",
  gap: 4,
};

const pickerPanelStyle: CSSProperties = {
  overflow: "hidden",
  minHeight: 260,
  height: "min(42vh, 420px)",
};

const pickerContentStyle: CSSProperties = {
  height: "100%",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
};

const miniBoardWrapStyle: CSSProperties = {
  padding: "6px 0 4px",
  display: "flex",
  justifyContent: "center",
};

const miniBoardInnerStyle: CSSProperties = {
  width: "min(100%, 320px)",
  aspectRatio: "1 / 1",
  overflow: "hidden",
};

const collapsibleHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const collapseButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  background: "#fff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
  cursor: "pointer",
};

const emptyPickerStyle: CSSProperties = {
  padding: 14,
  fontSize: 13,
  color: "#64748b",
};

const stepTypeButtonStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fff",
  color: "#111827",
  borderRadius: 12,
  padding: "12px 14px",
  textAlign: "left",
  cursor: "pointer",
  WebkitTextFillColor: "#111827",
};

const stepTypeTitleStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 14,
  color: "#111827",
  marginBottom: 4,
};

const stepTypeDescStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.4,
};

const stepsListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const stepCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fff",
  borderRadius: 14,
  padding: 12,
};

const activeStepCardStyle: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#eff6ff",
};

const stepSelectButtonStyle: CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  cursor: "pointer",
};

const stepMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
  fontWeight: 700,
};

const stepTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 6,
};

const stepPromptStyle: CSSProperties = {
  fontSize: 13,
  color: "#4b5563",
  lineHeight: 1.4,
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  border: "1px dashed #cfd8e3",
  borderRadius: 14,
  padding: 16,
  fontSize: 14,
  color: "#6b7280",
  background: "#fafcff",
};