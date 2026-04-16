import type { CSSProperties } from "react";
import type { MultipleChoiceInteraction, MultipleChoiceOption } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createLocalizedText, readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
};

function newOption(isCorrect: boolean): MultipleChoiceOption {
  return {
    id: crypto.randomUUID(),
    label: createLocalizedText("", ""),
    isCorrect,
  };
}

export default function AuthoringMultipleChoiceMomentFields({ moment, language, onApply }: Props) {
  if (moment.type !== "multipleChoice" || moment.interaction?.kind !== "multipleChoice") {
    return null;
  }

  const ix = moment.interaction;
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const options = ix.options ?? [];

  const patchIx = (partial: Partial<MultipleChoiceInteraction>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  const setOptions = (next: MultipleChoiceOption[]) => {
    patchIx({ options: next });
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const list = [...options];
    [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
    setOptions(list);
  };

  const moveDown = (index: number) => {
    if (index >= options.length - 1) return;
    const list = [...options];
    [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
    setOptions(list);
  };

  const duplicateAt = (index: number) => {
    const src = options[index];
    if (!src) return;
    const copy: MultipleChoiceOption = {
      id: crypto.randomUUID(),
      label: src.label,
      isCorrect: src.isCorrect,
      ...(src.explanation ? { explanation: src.explanation } : {}),
    };
    const list = [...options.slice(0, index + 1), copy, ...options.slice(index + 1)];
    setOptions(list);
  };

  const addOptionBelow = (index: number) => {
    const list = [...options.slice(0, index + 1), newOption(false), ...options.slice(index + 1)];
    setOptions(list);
  };

  const removeAt = (index: number) => {
    if (options.length <= 1) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const patchOption = (index: number, partial: Partial<MultipleChoiceOption>) => {
    const list = options.map((o, i) => (i === index ? { ...o, ...partial } : o));
    setOptions(list);
  };

  const promptPlain = readLocalizedText(ix.prompt, language);
  const wrongPlain = readLocalizedText(ix.wrongMessage, language);
  const hintPlain = readLocalizedText(ix.hintMessage, language);
  const successCoachPlain = readLocalizedText(ix.successCoachCaption, language);
  const wrongCoachPlain = readLocalizedText(ix.wrongCoachCaption, language);

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("multipleChoice (preview)", "multipleChoice (preview)")}</div>
      <label style={labelStyle}>
        {t("Prompt (optional)", "Prompt (optioneel)")}
        <input
          type="text"
          style={inputStyle}
          value={promptPlain}
          placeholder={t("Question line", "Vraagregel")}
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
      <label style={checkRowStyle}>
        <input
          type="checkbox"
          checked={!!ix.allowMultiple}
          onChange={(e) => patchIx({ allowMultiple: e.target.checked })}
        />
        {t("Allow multiple correct selections", "Meerdere juiste antwoorden toestaan")}
      </label>
      <div style={rowStyle}>
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
          value={wrongPlain}
          onChange={(e) =>
            patchIx({
              wrongMessage: writeLocalizedText(ix.wrongMessage ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Hint (preview)", "Hint (preview)")}
        <input
          type="text"
          style={inputStyle}
          value={hintPlain}
          placeholder={t("Optional yellow hint box", "Optioneel gele hint")}
          onChange={(e) =>
            patchIx({
              hintMessage: writeLocalizedText(ix.hintMessage ?? createLocalizedText("", ""), language, e.target.value),
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

      <div style={secTitleStyle}>{t("Options", "Opties")}</div>
      {options.map((opt, index) => (
        <div key={opt.id} style={optCardStyle}>
          <div style={optHeadStyle}>
            <span style={optBadgeStyle}>#{index + 1}</span>
            <div style={optBtnRowStyle}>
              <button type="button" style={miniBtnStyle} onClick={() => moveUp(index)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                style={miniBtnStyle}
                onClick={() => moveDown(index)}
                disabled={index >= options.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                style={miniBtnStyle}
                onClick={() => addOptionBelow(index)}
                title={t("Insert blank option below this row", "Lege optie hieronder invoegen")}
              >
                +↓
              </button>
              <button
                type="button"
                style={miniBtnStyle}
                onClick={() => duplicateAt(index)}
                title={t("Duplicate this option (new id)", "Dupliceer deze optie (nieuw id)")}
              >
                ⧉
              </button>
              <button
                type="button"
                style={delBtnStyle}
                onClick={() => removeAt(index)}
                disabled={options.length <= 1}
              >
                ×
              </button>
            </div>
          </div>
          <label style={labelStyle}>
            {t("Label", "Label")}
            <input
              type="text"
              style={inputStyle}
              value={readLocalizedText(opt.label, language)}
              onChange={(e) =>
                patchOption(index, {
                  label: writeLocalizedText(opt.label, language, e.target.value),
                })
              }
            />
          </label>
          <label style={checkRowStyle}>
            <input
              type="checkbox"
              checked={opt.isCorrect}
              onChange={(e) => patchOption(index, { isCorrect: e.target.checked })}
            />
            {t("Correct answer", "Juist antwoord")}
          </label>
          <label style={labelStyle}>
            {t("Explanation (optional, stored)", "Uitleg (optioneel, wordt bewaard)")}
            <input
              type="text"
              style={inputStyle}
              value={readLocalizedText(opt.explanation, language)}
              placeholder={t("Short note for this option", "Korte noot bij deze optie")}
              onChange={(e) =>
                patchOption(index, {
                  explanation: writeLocalizedText(
                    opt.explanation ?? createLocalizedText("", ""),
                    language,
                    e.target.value
                  ),
                })
              }
            />
          </label>
        </div>
      ))}
      <button type="button" style={addBtnStyle} onClick={() => setOptions([...options, newOption(false)])}>
        {t("+ Option (end)", "+ Optie (einde)")}
      </button>
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

const secTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#6d28d9",
  marginTop: 4,
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
  gap: 10,
  alignItems: "flex-end",
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

const optCardStyle: CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid #e9d5ff",
  background: "#fff",
  display: "grid",
  gap: 6,
};

const optHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const optBadgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#7c3aed",
};

const optBtnRowStyle: CSSProperties = {
  display: "flex",
  gap: 4,
};

const miniBtnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 6px",
  borderRadius: 6,
  border: "1px solid #c4b5fd",
  background: "#f5f3ff",
  cursor: "pointer",
  color: "#4c1d95",
};

const delBtnStyle: CSSProperties = {
  ...miniBtnStyle,
  borderColor: "#fecaca",
  background: "#fef2f2",
  color: "#991b1b",
};

const addBtnStyle: CSSProperties = {
  ...inputStyle,
  fontWeight: 700,
  cursor: "pointer",
  background: "#ede9fe",
  borderColor: "#a78bfa",
  color: "#4c1d95",
  justifySelf: "start",
};
