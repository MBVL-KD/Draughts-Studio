import { useState } from "react";
import type { CSSProperties } from "react";
import type { LanguageCode } from "../types/i18nTypes";

type Props = {
  language: LanguageCode;
  context: "step" | "branch";
  selectedMomentId: string | null;
  wholeMomentCanPaste: boolean;
  onCopyWholeMoment: () => void;
  onPasteWholeMoment: () => void;
  showDuplicateToNewStep: boolean;
  onDuplicateToNewStep?: () => void;
  showDuplicateToBranch: boolean;
  onDuplicateToBranch?: () => void;
  showMoveToMainStep: boolean;
  onMoveToMainStep?: () => void;
};

export default function AuthoringTimelineMomentFlowBar({
  language,
  context,
  selectedMomentId,
  wholeMomentCanPaste,
  onCopyWholeMoment,
  onPasteWholeMoment,
  showDuplicateToNewStep,
  onDuplicateToNewStep,
  showDuplicateToBranch,
  onDuplicateToBranch,
  showMoveToMainStep,
  onMoveToMainStep,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div style={wrapStyle}>
      <div style={headerRowStyle}>
        <span style={labelStyle}>{t("Moment flow", "Moment-stroom")}</span>
        <button type="button" style={collapseBtnStyle} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {collapsed ? null : <div style={rowStyle}>
        <button
          type="button"
          style={btnStyle}
          disabled={!selectedMomentId}
          onClick={onCopyWholeMoment}
          title={t("Copy entire moment", "Heel moment kopiëren")}
        >
          {t("Copy moment", "Kopieer moment")}
        </button>
        <button
          type="button"
          style={wholeMomentCanPaste ? btnStyle : btnDisabledStyle}
          disabled={!wholeMomentCanPaste}
          onClick={onPasteWholeMoment}
          title={t("Paste after selected (or append)", "Plakken na selectie (of achteraan)")}
        >
          {t("Paste moment", "Plak moment")}
        </button>
        {context === "step" && showDuplicateToNewStep ? (
          <button
            type="button"
            style={selectedMomentId ? accentBtnStyle : btnDisabledStyle}
            disabled={!selectedMomentId}
            onClick={onDuplicateToNewStep}
          >
            {t("Dup → new step", "Dup → nieuwe stap")}
          </button>
        ) : null}
        {context === "step" && showDuplicateToBranch ? (
          <button
            type="button"
            style={selectedMomentId ? accentBtnStyle : btnDisabledStyle}
            disabled={!selectedMomentId}
            onClick={onDuplicateToBranch}
          >
            {t("Dup → branch + link", "Dup → zijlijn + link")}
          </button>
        ) : null}
        {context === "branch" && showMoveToMainStep ? (
          <button
            type="button"
            style={selectedMomentId ? warnBtnStyle : btnDisabledStyle}
            disabled={!selectedMomentId}
            onClick={onMoveToMainStep}
          >
            {t("Move → main step", "Verplaats → hoofdstap")}
          </button>
        ) : null}
      </div>}
      {collapsed ? null : <p style={hintStyle}>
        {t(
          "Paste inserts after the selected moment (or at end if none). Extract to branch still moves moments; this row duplicates or moves single items.",
          "Plakken voegt in na het geselecteerde moment (of achteraan). ‘Naar zijlijn’ verplaatst nog steeds; hier dupliceer of verplaats je losse items."
        )}
      </p>}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  marginBottom: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #bae6fd",
  background: "#f0f9ff",
  display: "grid",
  gap: 6,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#0369a1",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const collapseBtnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #bae6fd",
  background: "#fff",
  color: "#0369a1",
  cursor: "pointer",
};

const btnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid #7dd3fc",
  background: "#fff",
  cursor: "pointer",
  color: "#0c4a6e",
};

const btnDisabledStyle: CSSProperties = {
  ...btnStyle,
  opacity: 0.45,
  cursor: "not-allowed",
};

const accentBtnStyle: CSSProperties = {
  ...btnStyle,
  borderColor: "#93c5fd",
  background: "#eff6ff",
};

const warnBtnStyle: CSSProperties = {
  ...btnStyle,
  borderColor: "#fcd34d",
  background: "#fffbeb",
  color: "#92400e",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  color: "#64748b",
  lineHeight: 1.35,
};
