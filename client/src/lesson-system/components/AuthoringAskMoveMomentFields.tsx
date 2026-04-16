import type { CSSProperties } from "react";
import type { AskMoveInteraction } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createLocalizedText, readLocalizedText } from "../utils/i18nHelpers";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
};

function parseCommaSquares(raw: string): number[] | undefined {
  const parts = raw.split(/[,;\s]+/).map((p) => Number(p.trim()));
  const nums = parts.filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
  if (nums.length === 0) return undefined;
  return [...new Set(nums)];
}

function formatCommaSquares(list: number[] | undefined): string {
  return list?.length ? list.join(", ") : "";
}

function toNotation(from: number, to: number, captures?: number[], path?: number[]): string {
  const p = Array.isArray(path) && path.length >= 2 ? path : [from, to];
  const isCapture = (captures?.length ?? 0) > 0 || p.length > 2;
  return p.join(isCapture ? "x" : "-");
}

export default function AuthoringAskMoveMomentFields({ moment, language, onApply }: Props) {
  if (moment.type !== "askMove" || moment.interaction?.kind !== "askMove") {
    return null;
  }

  const ix = moment.interaction;
  const e0 = ix.expectedMoves?.[0] ?? { from: 31, to: 35 };
  const wrongPlain = readLocalizedText(ix.wrongMessage, language);
  const illegalPlain = readLocalizedText(moment.illegalResponses?.[0]?.message, language);
  const successCoachPlain = readLocalizedText(ix.successCoachCaption, language);
  const wrongCoachPlain = readLocalizedText(ix.wrongCoachCaption, language);
  const hintSquaresPlain = formatCommaSquares(ix.wrongHintHighlightSquares);

  const patchIx = (partial: Partial<AskMoveInteraction>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("askMove (preview)", "askMove (preview)")}</div>
      <p style={helperStyle}>
        {t(
          "Record one move on the Editor board and use Apply → askMove. That recorded move is the expected answer.",
          "Neem in Editor één zet op op het bord en gebruik Apply → askMove. Die opgenomen zet is het verwachte antwoord."
        )}
      </p>
      <div style={expectedMoveBadge}>{toNotation(e0.from, e0.to, e0.captures, e0.path)}</div>
      <div style={rowStyle}>
        <label style={labelStyle}>
          {t("Max attempts", "Max. pogingen")}
          <input
            type="number"
            min={1}
            max={99}
            value={ix.maxAttempts ?? 1}
            style={inputStyle}
            disabled
            onChange={(ev) => {
              const n = Number(ev.target.value);
              patchIx({ maxAttempts: Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1 });
            }}
          />
        </label>
        <label style={inlineCheckStyle}>
          <input
            type="checkbox"
            checked={ix.allowRetry === true}
            disabled
            onChange={(ev) => patchIx({ allowRetry: ev.target.checked })}
          />
          {t("Allow retry", "Opnieuw proberen")}
        </label>
      </div>

      <div style={subTitleStyle}>{t("Feedback (preview)", "Feedback (preview)")}</div>
      <label style={blockLabelStyle}>
        {t("Wrong hint squares (comma)", "Hintvelden na fout (komma)")}
        <input
          type="text"
          style={wideInputStyle}
          placeholder="33, 39"
          value={hintSquaresPlain}
          onChange={(ev) => {
            const list = parseCommaSquares(ev.target.value);
            patchIx({
              wrongHintHighlightSquares: list,
            });
          }}
        />
      </label>
      <label style={blockLabelStyle}>
        {t("Success coach line", "Coachregel bij succes")}
        <textarea
          value={successCoachPlain}
          style={textareaStyle}
          rows={2}
          onChange={(ev) => {
            const v = ev.target.value;
            patchIx({
              successCoachCaption: v.trim() ? createLocalizedText(v, v) : undefined,
            });
          }}
        />
      </label>
      <label style={blockLabelStyle}>
        {t("Wrong / illegal coach line", "Coachregel bij fout / illegaal")}
        <textarea
          value={wrongCoachPlain}
          style={textareaStyle}
          rows={2}
          onChange={(ev) => {
            const v = ev.target.value;
            patchIx({
              wrongCoachCaption: v.trim() ? createLocalizedText(v, v) : undefined,
            });
          }}
        />
      </label>

      <label style={blockLabelStyle}>
        {t("Wrong / not intended message", "Fout / niet de bedoeling")}
        <textarea
          value={wrongPlain}
          style={textareaStyle}
          rows={2}
          onChange={(ev) => {
            const v = ev.target.value;
            patchIx({
              wrongMessage: v.trim() ? createLocalizedText(v, v) : undefined,
            });
          }}
        />
      </label>
      <label style={blockLabelStyle}>
        {t("Illegal / not allowed message", "Illegaal / niet toegestaan")}
        <textarea
          value={illegalPlain}
          style={textareaStyle}
          rows={2}
          onChange={(ev) => {
            const raw = ev.target.value;
            const v = raw.trim();
            onApply({
              ...moment,
              illegalResponses: v
                ? [{ message: createLocalizedText(raw, raw) }]
                : undefined,
            });
          }}
        />
      </label>
      <button
        type="button"
        style={clearOptionalStyle}
        onClick={() =>
          onApply({
            ...moment,
            constraints: undefined,
            strategicResponses: undefined,
          })
        }
      >
        {t("Clear advanced restrictions", "Wis geavanceerde beperkingen")}
      </button>
    </div>
  );
}

const rootStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 10,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
};

const subTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  marginTop: 4,
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
};

const blockLabelStyle: CSSProperties = {
  ...labelStyle,
  width: "100%",
};

const inlineCheckStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  width: 72,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 13,
};

const helperStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#475569",
  lineHeight: 1.45,
};

const expectedMoveBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#0f172a",
  fontWeight: 700,
  fontSize: 14,
  padding: "6px 10px",
};

const clearOptionalStyle: CSSProperties = {
  alignSelf: "flex-start",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  fontWeight: 600,
  fontSize: 12,
  padding: "6px 10px",
  cursor: "pointer",
};

const wideInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 12,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 12,
  resize: "vertical",
};
