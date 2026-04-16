import { useState } from "react";
import type { CSSProperties } from "react";
import type { LanguageCode } from "../types/i18nTypes";

type Props = {
  language: LanguageCode;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
};

export default function AuthoringMomentComfortBar({
  language,
  canPaste,
  onCopy,
  onPaste,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div style={wrapStyle}>
      <div style={headRowStyle}>
        <span style={labelStyle}>{t("Moment clipboard", "Moment-klembord")}</span>
        <button type="button" style={collapseBtnStyle} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {collapsed ? null : <div style={btnRowStyle}>
        <button type="button" style={btnStyle} onClick={onCopy}>
          {t("Copy overlays + runtime", "Kopieer overlays + runtime")}
        </button>
        <button type="button" style={canPaste ? btnStyle : btnDisabledStyle} disabled={!canPaste} onClick={onPaste}>
          {t("Paste onto selected", "Plak op geselecteerd")}
        </button>
      </div>}
      {collapsed ? null : <p style={hintStyle}>
        {t(
          "Copies highlights, routes, glyphs, coach/camera/fx/ui, and timing — not move refs or interactions.",
          "Kopieert highlights, routes, glyphs, coach/camera/fx/ui en timing — geen zetrefs of interacties."
        )}
      </p>}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  marginBottom: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
};

const headRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
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

const btnRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const btnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  color: "#0f172a",
};

const btnDisabledStyle: CSSProperties = {
  ...btnStyle,
  opacity: 0.45,
  cursor: "not-allowed",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  color: "#64748b",
  lineHeight: 1.4,
};
