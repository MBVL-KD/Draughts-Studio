import type { CSSProperties } from "react";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  currentBoardFen?: string;
};

export default function AuthoringMomentTextFields({
  moment,
  language,
  onApply,
  currentBoardFen,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>{t("Moment text", "Moment-tekst")}</div>
      {moment.type === "focusBoard" ? (
        <div style={focusRowStyle}>
          <button
            type="button"
            style={actionBtnStyle}
            disabled={!currentBoardFen?.trim()}
            onClick={() =>
              onApply({
                ...moment,
                positionRef: currentBoardFen?.trim()
                  ? { type: "fen", fen: currentBoardFen.trim() }
                  : moment.positionRef,
              })
            }
          >
            {t("Use current board as focus position", "Gebruik huidig bord als focus-positie")}
          </button>
        </div>
      ) : null}
      <label style={labelStyle}>
        {t("Title", "Titel")}
        <input
          style={inputStyle}
          value={readLocalizedText(moment.title, language)}
          onChange={(e) =>
            onApply({
              ...moment,
              title: writeLocalizedText(moment.title, language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Body", "Tekst")}
        <textarea
          style={textareaStyle}
          rows={4}
          value={readLocalizedText(moment.body, language)}
          onChange={(e) =>
            onApply({
              ...moment,
              body: writeLocalizedText(moment.body, language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Caption", "Bijschrift")}
        <input
          style={inputStyle}
          value={readLocalizedText(moment.caption, language)}
          onChange={(e) =>
            onApply({
              ...moment,
              caption: writeLocalizedText(moment.caption, language, e.target.value),
            })
          }
        />
      </label>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  marginBottom: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fff",
  display: "grid",
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: "#475569",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 72,
};

const focusRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const actionBtnStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 10px",
  background: "#f8fafc",
  fontSize: 12,
  cursor: "pointer",
};
