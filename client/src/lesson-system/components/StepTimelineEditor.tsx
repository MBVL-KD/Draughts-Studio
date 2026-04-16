import { useState } from "react";
import type { CSSProperties } from "react";
import type { StepMoment, StepMomentType } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import { createMoment } from "../utils/timelineMomentFactories";
import {
  createMomentFromPreset,
  listAuthoringMomentPresets,
  type AuthoringMomentPresetId,
} from "../utils/timelineMomentPresets";
import {
  deleteMoment,
  duplicateMoment,
  insertMomentAfter,
  insertMomentBefore,
  moveMomentDown,
  moveMomentUp,
} from "../utils/timelineMomentSequence";

export type StepTimelineEditorProps = {
  moments: StepMoment[];
  selectedMomentId: string | null;
  language: LanguageCode;
  quickAddTypes: readonly StepMomentType[];
  onSelectMoment: (momentId: string | null) => void;
  onTimelineChange: (next: StepMoment[]) => void;
  /** Bundel 6b: split current step at selected moment (new step gets tail timeline). */
  onSplitStepAtSelectedMoment?: () => void;
  /** Bundel 6b: move selected moment(s) to a new step (MVP: single selected moment). */
  onExtractSelectedMomentsToNewStep?: () => void;
  /** Bundel 7a: same selection → `branchesById` + `enterBranch` link on this step. */
  onExtractSelectedMomentsToBranch?: () => void;
  /** When false, extract button is disabled (e.g. need ≥2 moments to leave one behind). */
  canExtractSelectedMoment?: boolean;
};

/**
 * Dumb timeline: list, selection, CRUD, reorder, callbacks only.
 * No board, recorder, or runtime player logic.
 */
export default function StepTimelineEditor({
  moments,
  selectedMomentId,
  language,
  quickAddTypes,
  onSelectMoment,
  onTimelineChange,
  onSplitStepAtSelectedMoment,
  onExtractSelectedMomentsToNewStep,
  onExtractSelectedMomentsToBranch,
  canExtractSelectedMoment = false,
}: StepTimelineEditorProps) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [presetsCollapsed, setPresetsCollapsed] = useState(true);
  const [quickAddCollapsed, setQuickAddCollapsed] = useState(false);

  const insertPresetRelative = (presetId: AuthoringMomentPresetId, position: "before" | "after") => {
    const m = createMomentFromPreset(presetId);
    const anchor = selectedMomentId;
    const next =
      anchor == null
        ? position === "before"
          ? insertMomentBefore(moments, null, m)
          : insertMomentAfter(moments, null, m)
        : position === "before"
          ? insertMomentBefore(moments, anchor, m)
          : insertMomentAfter(moments, anchor, m);
    onTimelineChange(next);
    onSelectMoment(m.id);
  };

  const labelFor = (m: StepMoment) => {
    if (m.type === "showLine" && m.lineRef?.type === "inline") {
      const seq = m.lineRef.moves
        .map((mv) => {
          if (mv.type !== "inline") return "?";
          const isCapture = (mv.captures?.length ?? 0) > 0 || ((mv.path?.length ?? 0) > 2);
          return `${mv.from}${isCapture ? "x" : "-"}${mv.to}`;
        })
        .join(" ");
      const short = seq || readLocalizedText(m.title, language).trim() || "showLine";
      return `showLine: ${short}`.slice(0, 72);
    }
    const title = readLocalizedText(m.title, language).trim();
    const body = readLocalizedText(m.body, language).trim();
    const cap = readLocalizedText(m.caption, language).trim();
    const head = title || body || cap || m.type;
    return `${m.type}: ${head}`.slice(0, 72);
  };

  return (
    <div style={rootStyle}>
      <div style={headerRowStyle}>
        <strong style={titleStyle}>{t("Timeline", "Tijdlijn")}</strong>
        <span style={metaStyle}>
          {moments.length} moments · ⧉{" "}
          {t("duplicate (clean copy, unlinked)", "duplicaat (schone kopie, zonder branch)")}
        </span>
      </div>

      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>{t("Quick add", "Snel toevoegen")}</span>
        <button
          type="button"
          style={collapseBtnStyle}
          onClick={() => setQuickAddCollapsed((v) => !v)}
        >
          {quickAddCollapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {quickAddCollapsed ? null : <div style={quickRowStyle}>
        {quickAddTypes.map((type) => (
          <button
            key={type}
            type="button"
            style={tinyBtnStyle}
            onClick={() => {
              const m = createMoment(type);
              onTimelineChange([...moments, m]);
              onSelectMoment(m.id);
            }}
          >
            + {type}
          </button>
        ))}
      </div>}

      <div style={presetSectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={presetLabelStyle}>{t("Presets", "Presets")}</span>
          <button
            type="button"
            style={collapseBtnStyle}
            onClick={() => setPresetsCollapsed((v) => !v)}
          >
            {presetsCollapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
          </button>
        </div>
        {presetsCollapsed ? null : <div style={presetRowStyle}>
          {listAuthoringMomentPresets().map((p) => (
            <div key={p.id} style={presetItemRowStyle}>
              <button
                type="button"
                style={presetChevronStyle}
                title={t("Insert before selected", "Invoegen vóór selectie")}
                onClick={() => insertPresetRelative(p.id, "before")}
              >
                ◁
              </button>
              <span style={presetNameStyle}>{language === "nl" ? p.labelNl : p.labelEn}</span>
              <button
                type="button"
                style={presetChevronStyle}
                title={t("Insert after selected (or append)", "Invoegen na selectie (of achteraan)")}
                onClick={() => insertPresetRelative(p.id, "after")}
              >
                ▷
              </button>
            </div>
          ))}
        </div>}
      </div>

      {onSplitStepAtSelectedMoment ||
      onExtractSelectedMomentsToNewStep ||
      onExtractSelectedMomentsToBranch ? (
        <div style={splitActionsRowStyle}>
          {onSplitStepAtSelectedMoment ? (
            <button
              type="button"
              style={
                selectedMomentId ? splitActionBtnStyle : splitActionBtnDisabledStyle
              }
              disabled={!selectedMomentId}
              onClick={() => onSplitStepAtSelectedMoment?.()}
            >
              {t("Split here", "Splits hier")}
            </button>
          ) : null}
          {onExtractSelectedMomentsToNewStep ? (
            <button
              type="button"
              style={
                selectedMomentId && canExtractSelectedMoment
                  ? splitActionBtnStyle
                  : splitActionBtnDisabledStyle
              }
              disabled={!selectedMomentId || !canExtractSelectedMoment}
              onClick={() => onExtractSelectedMomentsToNewStep?.()}
            >
              {t("Extract to new step", "Naar nieuwe stap")}
            </button>
          ) : null}
          {onExtractSelectedMomentsToBranch ? (
            <button
              type="button"
              style={
                selectedMomentId && canExtractSelectedMoment
                  ? splitActionBtnStyle
                  : splitActionBtnDisabledStyle
              }
              disabled={!selectedMomentId || !canExtractSelectedMoment}
              onClick={() => onExtractSelectedMomentsToBranch?.()}
            >
              {t("Extract to branch", "Naar zijlijn")}
            </button>
          ) : null}
        </div>
      ) : null}

      <ul style={listStyle}>
        {moments.map((m) => {
          const active = m.id === selectedMomentId;
          return (
            <li key={m.id} style={itemRowStyle}>
              <button
                type="button"
                onClick={() => onSelectMoment(m.id)}
                style={{
                  ...itemButtonStyle,
                  borderColor: active ? "#2563eb" : "#e2e8f0",
                  background: active ? "#eff6ff" : "#fff",
                }}
              >
                {labelFor(m)}
              </button>
              <div style={actionsStyle}>
                <button
                  type="button"
                  style={iconBtnStyle}
                  title={t("Up", "Omhoog")}
                  onClick={() => {
                    onTimelineChange(moveMomentUp(moments, m.id));
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={iconBtnStyle}
                  title={t("Down", "Omlaag")}
                  onClick={() => {
                    onTimelineChange(moveMomentDown(moments, m.id));
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  style={iconBtnStyle}
                  title={t("Duplicate", "Dupliceren")}
                  onClick={() => {
                    onTimelineChange(duplicateMoment(moments, m.id));
                  }}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  style={iconBtnStyle}
                  title={t("Delete", "Verwijderen")}
                  onClick={() => {
                    const next = deleteMoment(moments, m.id);
                    onTimelineChange(next);
                    if (selectedMomentId === m.id) {
                      onSelectMoment(next[0]?.id ?? null);
                    }
                  }}
                >
                  ×
                </button>
              </div>
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
  gap: 10,
  minHeight: 0,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const titleStyle: CSSProperties = { fontSize: 13 };

const metaStyle: CSSProperties = { fontSize: 11, color: "#64748b" };

const quickRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#334155",
};

const presetSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingTop: 4,
  borderTop: "1px solid #e2e8f0",
};

const presetLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6b21a8",
};

const collapseBtnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
};

const presetRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const presetItemRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const presetNameStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#5b21b6",
  flex: "1 1 120px",
};

const presetChevronStyle: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid #c4b5fd",
  background: "#faf5ff",
  color: "#5b21b6",
  cursor: "pointer",
  fontWeight: 800,
};

const tinyBtnStyle: CSSProperties = {
  fontSize: 10,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
};

const splitActionsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const splitActionBtnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #93c5fd",
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
};

const splitActionBtnDisabledStyle: CSSProperties = {
  ...splitActionBtnStyle,
  opacity: 0.45,
  cursor: "not-allowed",
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
};

const itemRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 6,
};

const itemButtonStyle: CSSProperties = {
  flex: 1,
  textAlign: "left",
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  cursor: "pointer",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const iconBtnStyle: CSSProperties = {
  width: 28,
  minHeight: 24,
  fontSize: 12,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  padding: 0,
};
