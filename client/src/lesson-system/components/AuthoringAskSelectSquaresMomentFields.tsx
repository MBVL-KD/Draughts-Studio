import type { CSSProperties } from "react";
import type { AskSelectSquaresInteraction } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createLocalizedText, readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import { parseCommaSquareIds, stringifySquareIds } from "../utils/selectionSquareSetHelpers";
import AuthoringSquareSetEditor from "./AuthoringSquareSetEditor";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  studioSelection: number[];
  targetPickMode: boolean;
  onTargetPickModeChange: (active: boolean) => void;
  hasTargetClip: boolean;
  onCopyTargets: () => void;
  onPasteTargets: () => void;
};

export default function AuthoringAskSelectSquaresMomentFields({
  moment,
  language,
  onApply,
  studioSelection,
  targetPickMode,
  onTargetPickModeChange,
  hasTargetClip,
  onCopyTargets,
  onPasteTargets,
}: Props) {
  if (moment.type !== "askSelectSquares" || moment.interaction?.kind !== "askSelectSquares") {
    return null;
  }

  const ix = moment.interaction;
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  const patchIx = (partial: Partial<AskSelectSquaresInteraction>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("askSelectSquares (preview)", "askSelectSquares (preview)")}</div>
      <label style={labelStyle}>
        {t("Prompt (optional)", "Prompt (optioneel)")}
        <input
          type="text"
          style={inputStyle}
          value={readLocalizedText(ix.prompt, language)}
          onChange={(e) =>
            patchIx({
              prompt: writeLocalizedText(ix.prompt ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Body / fallback", "Body / fallback")}
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

      <AuthoringSquareSetEditor
        variant="squares"
        language={language}
        targets={ix.targetSquares ?? []}
        onTargetsChange={(next) => patchIx({ targetSquares: next })}
        studioSelection={studioSelection}
        targetPickMode={targetPickMode}
        onTargetPickModeChange={onTargetPickModeChange}
        hasClipboard={hasTargetClip}
        onCopyTargets={onCopyTargets}
        onPasteTargets={onPasteTargets}
      />

      <label style={labelStyle}>
        {t("Hint squares (optional)", "Hint-velden (optioneel)")}
        <input
          type="text"
          style={inputStyle}
          spellCheck={false}
          value={stringifySquareIds(ix.hintSquares)}
          onChange={(e) => patchIx({ hintSquares: parseCommaSquareIds(e.target.value) })}
        />
      </label>
      <div style={rowStyle}>
        <label style={checkRowStyle}>
          <input
            type="checkbox"
            checked={ix.requireExactSet !== false}
            onChange={(e) => patchIx({ requireExactSet: e.target.checked })}
          />
          {t("Require exact set", "Exact dezelfde set")}
        </label>
        <label style={labelStyle}>
          {t("Max attempts", "Max. pogingen")}
          <input
            type="number"
            min={1}
            max={99}
            style={inputStyle}
            value={ix.maxAttempts ?? 5}
            onChange={(e) => {
              const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 5)));
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
          value={readLocalizedText(ix.wrongMessage, language)}
          onChange={(e) =>
            patchIx({
              wrongMessage: writeLocalizedText(ix.wrongMessage ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Success coach", "Coach bij goed")}
        <input
          type="text"
          style={inputStyle}
          value={readLocalizedText(ix.successCoachCaption, language)}
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
        {t("Wrong coach", "Coach bij fout")}
        <input
          type="text"
          style={inputStyle}
          value={readLocalizedText(ix.wrongCoachCaption, language)}
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
  border: "1px solid #ddd6fe",
  background: "#faf5ff",
  display: "grid",
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#5b21b6",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#4c1d95",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
};

const checkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#4c1d95",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #c4b5fd",
  fontSize: 12,
};
