import type { CSSProperties } from "react";
import type { AskCountInteraction } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createLocalizedText, readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  /** Latest count typed in preview (Bundel 12b). */
  previewCountDraft?: string;
  onUsePreviewCountFromPreview?: () => void;
};

function parseAcceptedValues(raw: string): number[] | undefined {
  const parts = raw.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  const nums = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return undefined;
  return [...new Set(nums)];
}

function formatAcceptedValues(list: number[] | undefined): string {
  return list?.length ? list.join(", ") : "";
}

const QUICK_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export default function AuthoringAskCountMomentFields({
  moment,
  language,
  onApply,
  previewCountDraft = "",
  onUsePreviewCountFromPreview,
}: Props) {
  if (moment.type !== "askCount" || moment.interaction?.kind !== "askCount") {
    return null;
  }

  const ix = moment.interaction;
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  const patchIx = (partial: Partial<AskCountInteraction>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  const promptPlain = readLocalizedText(ix.prompt, language);
  const wrongPlain = readLocalizedText(ix.wrongMessage, language);
  const successCoachPlain = readLocalizedText(ix.successCoachCaption, language);
  const wrongCoachPlain = readLocalizedText(ix.wrongCoachCaption, language);

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("askCount (preview)", "askCount (preview)")}</div>
      <label style={labelStyle}>
        {t("Prompt (optional)", "Prompt (optioneel)")}
        <input
          type="text"
          style={inputStyle}
          value={promptPlain}
          placeholder={t("Short question", "Korte vraag")}
          onChange={(e) =>
            patchIx({
              prompt: writeLocalizedText(ix.prompt ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Body / fallback text", "Body / fallbacktekst")}
        <input
          type="text"
          style={inputStyle}
          value={readLocalizedText(moment.body, language)}
          onChange={(e) =>
            onApply({
              ...moment,
              body: writeLocalizedText(moment.body, language, e.target.value),
            })
          }
        />
      </label>
      <div style={rowStyle}>
        <label style={labelStyle}>
          {t("Correct value", "Juiste waarde")}
          <input
            type="number"
            style={inputStyle}
            value={ix.correctValue}
            onChange={(e) => {
              const v = Number(e.target.value);
              patchIx({ correctValue: Number.isFinite(v) ? v : ix.correctValue });
            }}
          />
        </label>
        {onUsePreviewCountFromPreview ? (
          <button
            type="button"
            style={miniBtnStyle}
            onClick={onUsePreviewCountFromPreview}
            title={
              language === "nl"
                ? `Voorbeeld-invoer: "${previewCountDraft.trim() || "—"}"`
                : `Preview draft: "${previewCountDraft.trim() || "—"}"`
            }
          >
            {t("Use preview value", "Gebruik preview-waarde")}
          </button>
        ) : null}
        <label style={labelStyle}>
          {t("Also accept (comma-separated)", "Ook goed (komma-gescheiden)")}
          <input
            type="text"
            style={inputStyle}
            value={formatAcceptedValues(ix.acceptedValues)}
            placeholder="2, 4"
            onChange={(e) => patchIx({ acceptedValues: parseAcceptedValues(e.target.value) })}
          />
        </label>
      </div>
      <div style={quickRowStyle}>
        <span style={quickLabelStyle}>{t("Quick set", "Snel instellen")}</span>
        {QUICK_COUNTS.map((n) => (
          <button key={n} type="button" style={chipBtnStyle} onClick={() => patchIx({ correctValue: n })}>
            {n}
          </button>
        ))}
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>
          {t("Max attempts", "Max. pogingen")}
          <input
            type="number"
            min={1}
            max={99}
            style={inputStyle}
            value={ix.maxAttempts ?? 3}
            onChange={(e) => {
              const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 3)));
              patchIx({ maxAttempts: n });
            }}
          />
        </label>
        <label style={checkRowStyle}>
          <input
            type="checkbox"
            checked={ix.allowRetry !== false}
            onChange={(e) => patchIx({ allowRetry: e.target.checked })}
          />
          {t("Allow retry", "Opnieuw proberen")}
        </label>
      </div>
      <label style={labelStyle}>
        {t("Wrong message", "Bericht bij fout")}
        <input
          type="text"
          style={inputStyle}
          value={wrongPlain}
          onChange={(e) =>
            patchIx({
              wrongMessage: writeLocalizedText(ix.wrongMessage ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Success coach caption", "Coach bij goed")}
        <input
          type="text"
          style={inputStyle}
          value={successCoachPlain}
          onChange={(e) =>
            patchIx({
              successCoachCaption: writeLocalizedText(
                ix.successCoachCaption ?? createLocalizedText("", ""),
                language,
                e.target.value
              ),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Wrong coach caption", "Coach bij fout")}
        <input
          type="text"
          style={inputStyle}
          value={wrongCoachPlain}
          onChange={(e) =>
            patchIx({
              wrongCoachCaption: writeLocalizedText(
                ix.wrongCoachCaption ?? createLocalizedText("", ""),
                language,
                e.target.value
              ),
            })
          }
        />
      </label>
    </div>
  );
}

const rootStyle: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #bae6fd",
  background: "#f0f9ff",
  display: "grid",
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#0369a1",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#0c4a6e",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
};

const checkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#0c4a6e",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #7dd3fc",
  fontSize: 12,
};

const miniBtnStyle: CSSProperties = {
  ...inputStyle,
  fontWeight: 700,
  cursor: "pointer",
  background: "#e0f2fe",
  alignSelf: "flex-end",
};

const quickRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const quickLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#0369a1",
  marginRight: 4,
};

const chipBtnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  minWidth: 26,
  padding: "3px 6px",
  borderRadius: 6,
  border: "1px solid #7dd3fc",
  background: "#fff",
  cursor: "pointer",
  color: "#0c4a6e",
};
