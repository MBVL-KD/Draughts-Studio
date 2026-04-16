import { useState } from "react";
import type { CSSProperties } from "react";
import type { LanguageCode } from "../types/i18nTypes";
import { uiText } from "../i18n/studioUiText";

type Props = {
  importSummary?: string | null;
  onImportFen: (fen: string) => void;
  onImportPdn: (pdn: string) => void;
  language?: LanguageCode;
};

export default function SourceImportPanel({
  importSummary,
  onImportFen,
  onImportPdn,
  language = "nl",
}: Props) {
  const [fenText, setFenText] = useState("");
  const [pdnText, setPdnText] = useState("");

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <div style={eyebrowStyle}>Import</div>
        <div style={titleStyle}>{uiText(language, "importTitle")}</div>
        <div style={subtitleStyle}>
          {uiText(language, "importSubtitle")}
        </div>
      </div>

      <div style={contentStyle}>
        {importSummary ? (
          <section style={feedbackCardStyle}>
            <strong>{uiText(language, "importResult")}:</strong> {importSummary}
          </section>
        ) : null}

        {/* FEN IMPORT */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>{uiText(language, "importFen")}</div>

          <div style={sectionTextStyle}>
            {uiText(language, "importFenHelp")}
          </div>

          <textarea
            value={fenText}
            onChange={(e) => setFenText(e.target.value)}
            placeholder="W:W31,32,33:B1,2,3"
            rows={5}
            style={textareaStyle}
          />

          <div style={actionsRowStyle}>
            <button
              type="button"
              onClick={() => {
                if (!fenText.trim()) return;
                onImportFen(fenText.trim());
                setFenText("");
              }}
              style={primaryButtonStyle}
            >
              {uiText(language, "importFen")}
            </button>

            <button
              type="button"
              onClick={() => setFenText("")}
              style={secondaryButtonStyle}
            >
              {uiText(language, "clear")}
            </button>
          </div>
        </section>

        {/* PDN IMPORT */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>{uiText(language, "importPdn")}</div>

          <div style={sectionTextStyle}>
            {uiText(language, "importPdnHelp")}
            <br />
            <strong>{uiText(language, "importPdnNote")}</strong>
          </div>

          <textarea
            value={pdnText}
            onChange={(e) => setPdnText(e.target.value)}
            placeholder={`[Event "Example"]\n1. 32-28 18-23 2. 28x19 ...`}
            rows={8}
            style={textareaStyle}
          />

          <div style={actionsRowStyle}>
            <button
              type="button"
              onClick={() => {
                if (!pdnText.trim()) return;
                onImportPdn(pdnText.trim());
                setPdnText("");
              }}
              style={primaryButtonStyle}
            >
              {uiText(language, "importPdn")}
            </button>

            <button
              type="button"
              onClick={() => setPdnText("")}
              style={secondaryButtonStyle}
            >
              {uiText(language, "clear")}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const headerStyle: CSSProperties = {
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

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "#64748b",
};

const contentStyle: CSSProperties = {
  display: "grid",
  gap: 14,
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

const sectionTextStyle: CSSProperties = {
  fontSize: 13,
  color: "#64748b",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "12px",
  fontSize: 12,
  fontFamily: "ui-monospace, monospace",
  background: "#fff",
  color: "#111827",
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid #2563eb",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  color: "#111827",
};

const feedbackCardStyle: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  background: "#eff6ff",
  padding: "10px 12px",
  color: "#1e3a8a",
  fontSize: 13,
  lineHeight: 1.5,
};