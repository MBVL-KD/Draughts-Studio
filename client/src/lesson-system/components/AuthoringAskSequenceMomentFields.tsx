import type { CSSProperties } from "react";
import type { AskSequenceInteraction, ExpectedMoveSpec } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import { AUTHORING_GLYPH_OPTIONS } from "../utils/authoringMomentPresentation";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  onFocusPly?: (index: number) => void;
};

function formatCommaSquares(list: number[] | undefined): string {
  return list?.length ? list.join(", ") : "";
}

function parseCommaSquares(raw: string): number[] | undefined {
  const parts = raw.split(/[,;\s]+/).map((p) => Number(p.trim()));
  const nums = parts.filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
  if (nums.length === 0) return undefined;
  return [...new Set(nums)];
}

function plySummary(spec: ExpectedMoveSpec): string {
  return `${spec.from}→${spec.to}`;
}

function moveRefForExpected(spec: ExpectedMoveSpec) {
  return {
    type: "inline" as const,
    from: spec.from,
    to: spec.to,
    path: spec.path,
    captures: spec.captures,
  };
}

function toNotation(spec: ExpectedMoveSpec): string {
  const isCapture = (spec.captures?.length ?? 0) > 0 || ((spec.path?.length ?? 0) > 2);
  if (spec.path && spec.path.length >= 2) {
    return spec.path.join(isCapture ? "x" : "-");
  }
  return `${spec.from}${isCapture ? "x" : "-"}${spec.to}`;
}

function parseSquares(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

function parseArrow(raw: string): { from: number; to: number } | null {
  const nums = raw
    .replace(/x/gi, "-")
    .split(/[-–→\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
  if (nums.length < 2) return null;
  return { from: nums[0]!, to: nums[nums.length - 1]! };
}

export default function AuthoringAskSequenceMomentFields({
  moment,
  language,
  onApply,
  onFocusPly,
}: Props) {
  if (moment.type !== "askSequence" || moment.interaction?.kind !== "askSequence") {
    return null;
  }

  const ix = moment.interaction;
  const seq = ix.expectedSequence?.length ? ix.expectedSequence : [{ from: 31, to: 35 }];

  const patchIx = (partial: Partial<AskSequenceInteraction>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  const patchMoment = (patch: Partial<StepMoment>) => onApply({ ...moment, ...patch });

  const addPly = () => {
    const last = seq[seq.length - 1] ?? { from: 31, to: 35 };
    patchIx({ expectedSequence: [...seq, { from: last.to, to: Math.min(50, last.to + 4) }] });
  };

  const removePly = (index: number) => {
    if (seq.length <= 1) return;
    patchIx({ expectedSequence: seq.filter((_, i) => i !== index) });
  };

  const insertPlyAfter = (index: number) => {
    const base = seq[index] ?? seq[seq.length - 1] ?? { from: 31, to: 35 };
    const inserted: ExpectedMoveSpec = {
      from: base.to,
      to: Math.min(50, base.to + 4),
    };
    const next = [...seq];
    next.splice(index + 1, 0, inserted);
    patchIx({ expectedSequence: next });
  };

  const wrongPlain = readLocalizedText(ix.wrongMessage, language);
  const illegalPlain = readLocalizedText(moment.illegalResponses?.[0]?.message, language);
  const hintPlain = readLocalizedText(ix.sequenceHintMessage, language);
  const successCoachPlain = readLocalizedText(ix.successCoachCaption, language);
  const wrongCoachPlain = readLocalizedText(ix.wrongCoachCaption, language);
  const hintSquaresPlain = formatCommaSquares(ix.wrongHintHighlightSquares);
  const hintPlan = Array.isArray(ix.hintPlan) ? ix.hintPlan : [];
  const hintTypeOptions: Array<{
    id: "from" | "to" | "from_to" | "path" | "captures" | "last_capture_leg";
    en: string;
    nl: string;
  }> = [
    { id: "from", en: "From square", nl: "Van-veld" },
    { id: "to", en: "To square", nl: "Naar-veld" },
    { id: "from_to", en: "From + to", nl: "Van + naar" },
    { id: "path", en: "Full path", nl: "Volledig pad" },
    { id: "captures", en: "Captured squares", nl: "Geslagen velden" },
    { id: "last_capture_leg", en: "Last capture leg", nl: "Laatste slagstap" },
  ];

  const patchHintPlanAt = (
    idx: number,
    partial: Partial<NonNullable<AskSequenceInteraction["hintPlan"]>[number]>
  ) => {
    const next = [...hintPlan];
    const cur = next[idx];
    if (!cur) return;
    next[idx] = { ...cur, ...partial };
    patchIx({ hintPlan: next });
  };

  const addHintPlanStep = () => {
    patchIx({
      hintPlan: [...hintPlan, { type: "from", afterFailedAttempts: hintPlan.length + 1 }],
    });
  };

  const removeHintPlanStep = (idx: number) => {
    patchIx({ hintPlan: hintPlan.filter((_, i) => i !== idx) });
  };

  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("askSequence (preview)", "askSequence (preview)")}</div>
      <p style={subStyle}>
        {t(
          "Player must complete all plies in order (or match the set if order is off). Preview only.",
          "Speler moet alle zetten in volgorde afmaken (of de set als volgorde uit staat). Alleen preview."
        )}
      </p>

      <p style={recorderHintStyle}>
        {t(
          "Tip: on the Editor tab, record a line on the board, then use “Apply → askSequence” to fill this list.",
          "Tip: op het tabblad Editor neem je een lijn op het bord op; gebruik daarna “Apply → askSequence” om deze lijst te vullen."
        )}
      </p>

      <label style={labelStyle}>
        {t("Prompt (player-facing)", "Prompt (voor speler)")}
        <input
          style={inputStyle}
          value={readLocalizedText(ix.prompt, language)}
          onChange={(e) =>
            patchIx({ prompt: writeLocalizedText(ix.prompt, language, e.target.value) })
          }
        />
      </label>

      <div style={sectionLabelStyle}>{t("Expected sequence", "Verwachte volgorde")}</div>
      <div style={sequenceListStyle}>
        {seq.map((spec, index) => (
          <div key={`ply-${index}-${spec.from}-${spec.to}`} style={plyCardStyle}>
            <div style={plyHeaderRowStyle}>
              <span style={plyIndexBadge}>{index + 1}</span>
              <button
                type="button"
                style={plyNotationBtnStyle}
                onClick={() => onFocusPly?.(index)}
                title={t("Show this ply on board", "Toon deze zet op bord")}
              >
                {toNotation(spec)}
              </button>
              <button
                type="button"
                style={miniInsertBtnStyle}
                onClick={() => insertPlyAfter(index)}
                title={t("Insert ply after this one", "Voeg zet na deze toe")}
              >
                +{t("ply", "zet")}
              </button>
              <button
                type="button"
                style={miniDangerIconStyle}
                disabled={seq.length <= 1}
                onClick={() => removePly(index)}
                title={t("Remove ply", "Zet verwijderen")}
              >
                ×
              </button>
            </div>
            <div style={plyAnnotGridStyle}>
              <label style={compactLabelStyle}>
                Glyph
                <select
                  style={inputStyle}
                  value={
                    moment.glyphMarkers?.find(
                      (g) =>
                        g.moveRef?.type === "inline" &&
                        g.moveRef.from === spec.from &&
                        g.moveRef.to === spec.to
                    )?.glyph ?? ""
                  }
                  onChange={(e) => {
                    const glyph = e.target.value;
                    const moveRef = moveRefForExpected(spec);
                    const rest = (moment.glyphMarkers ?? []).filter(
                      (g) =>
                        !(
                          g.moveRef?.type === "inline" &&
                          g.moveRef.from === spec.from &&
                          g.moveRef.to === spec.to
                        )
                    );
                    patchMoment({
                      glyphMarkers:
                        glyph === ""
                          ? rest
                          : [
                              ...rest,
                              {
                                id: crypto.randomUUID(),
                                glyph: glyph as (typeof AUTHORING_GLYPH_OPTIONS)[number],
                                moveRef,
                              },
                            ],
                    });
                  }}
                >
                  <option value="">—</option>
                  {AUTHORING_GLYPH_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label style={compactLabelStyle}>
                {t("Arrow (from-to)", "Pijl (van-naar)")}
                <input
                  style={inputStyle}
                  placeholder={plySummary(spec)}
                  value={(() => {
                    const ar = moment.overlays?.find(
                      (o) =>
                        o.type === "arrow" &&
                        o.id === `ask-seq-arrow-${index}`
                    );
                    return ar && ar.type === "arrow" ? `${ar.from}-${ar.to}` : "";
                  })()}
                  onChange={(e) => {
                    const parsed = parseArrow(e.target.value);
                    const rest = (moment.overlays ?? []).filter((o) => o.id !== `ask-seq-arrow-${index}`);
                    if (!parsed) {
                      patchMoment({ overlays: rest });
                      return;
                    }
                    patchMoment({
                      overlays: [
                        ...rest,
                        {
                          type: "arrow",
                          id: `ask-seq-arrow-${index}`,
                          from: parsed.from,
                          to: parsed.to,
                          style: "hint",
                        },
                      ],
                    });
                  }}
                />
              </label>
              <label style={compactLabelStyle}>
                {t("Highlights", "Highlights")}
                <input
                  style={inputStyle}
                  placeholder={t("e.g. 33, 29", "bijv. 33, 29")}
                  value={(() => {
                    const hl = moment.overlays?.find(
                      (o) => o.type === "highlight" && o.id === `ask-seq-hl-${index}`
                    );
                    return hl && hl.type === "highlight" ? hl.squares.join(", ") : "";
                  })()}
                  onChange={(e) => {
                    const squares = parseSquares(e.target.value);
                    const rest = (moment.overlays ?? []).filter((o) => o.id !== `ask-seq-hl-${index}`);
                    if (squares.length === 0) {
                      patchMoment({ overlays: rest });
                      return;
                    }
                    patchMoment({
                      overlays: [
                        ...rest,
                        {
                          type: "highlight",
                          id: `ask-seq-hl-${index}`,
                          squares,
                          style: "hint",
                        },
                      ],
                    });
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" style={addPlyStyle} onClick={addPly}>
        + {t("ply", "zet")}
      </button>

      <label style={inlineLabelStyle}>
        <input
          type="checkbox"
          checked={ix.requireExactOrder !== false}
          onChange={(e) => patchIx({ requireExactOrder: e.target.checked })}
        />
        {t("Require exact order", "Exacte volgorde verplicht")}
      </label>

      <label style={inlineLabelStyle}>
        <input
          type="checkbox"
          checked={ix.allowRetry !== false}
          onChange={(e) => patchIx({ allowRetry: e.target.checked })}
        />
        {t("Allow retry", "Opnieuw proberen")}
      </label>

      <label style={labelStyle}>
        {t("Max attempts", "Max. pogingen")}
        <input
          type="number"
          min={1}
          max={99}
          style={inputStyle}
          value={ix.maxAttempts ?? 1}
          onChange={(ev) => {
            const n = Number(ev.target.value);
            patchIx({ maxAttempts: Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1 });
          }}
        />
      </label>

      <div style={sectionLabelStyle}>{t("Feedback & hints", "Feedback & hints")}</div>
      <p style={feedbackHintStyle}>
        {t(
          "Preview shows progress as “n / total” and explains why an attempt stopped (wrong vs illegal).",
          "Preview toont voortgang als “n / totaal” en legt uit waarom een poging stopt (fout vs illegaal)."
        )}
      </p>

      <label style={labelStyle}>
        {t("Wrong move message", "Bericht bij foute zet")}
        <input
          style={inputStyle}
          value={wrongPlain}
          onChange={(e) =>
            patchIx({ wrongMessage: writeLocalizedText(ix.wrongMessage, language, e.target.value) })
          }
        />
      </label>

      <label style={labelStyle}>
        {t("Illegal move message", "Bericht bij illegale zet")}
        <input
          style={inputStyle}
          value={illegalPlain}
          onChange={(e) =>
            onApply({
              ...moment,
              illegalResponses: [
                {
                  message: writeLocalizedText(
                    moment.illegalResponses?.[0]?.message,
                    language,
                    e.target.value
                  ),
                },
              ],
            })
          }
        />
      </label>

      <label style={labelStyle}>
        {t("Optional hint (text)", "Optionele hint (tekst)")}
        <input
          style={inputStyle}
          value={hintPlain}
          onChange={(e) =>
            patchIx({
              sequenceHintMessage: writeLocalizedText(
                ix.sequenceHintMessage,
                language,
                e.target.value
              ),
            })
          }
        />
      </label>

      <label style={labelStyle}>
        {t("Wrong hint squares (comma)", "Hint-velden (komma)")}
        <input
          style={inputStyle}
          value={hintSquaresPlain}
          onChange={(e) =>
            patchIx({ wrongHintHighlightSquares: parseCommaSquares(e.target.value) })
          }
        />
      </label>

      <div style={sectionLabelStyle}>
        {t("Visual hint plan (ordered)", "Visueel hintplan (volgorde)")}
      </div>
      <p style={feedbackHintStyle}>
        {t(
          "Choose which board hint appears after fail #1, #2, ...",
          "Kies welke bordsuggestie verschijnt na fout #1, #2, ..."
        )}
      </p>
      <div style={sequenceListStyle}>
        {hintPlan.map((step, i) => (
          <div key={`hint-plan-${i}`} style={plyCardStyle}>
            <div style={plyHeaderRowStyle}>
              <span style={plyIndexBadge}>{i + 1}</span>
              <label style={compactLabelStyle}>
                {t("Hint type", "Hinttype")}
                <select
                  style={inputStyle}
                  value={step.type}
                  onChange={(e) =>
                    patchHintPlanAt(i, {
                      type: e.target.value as NonNullable<
                        AskSequenceInteraction["hintPlan"]
                      >[number]["type"],
                    })
                  }
                >
                  {hintTypeOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {language === "nl" ? opt.nl : opt.en}
                    </option>
                  ))}
                </select>
              </label>
              <label style={compactLabelStyle}>
                {t("After fail #", "Na fout #")}
                <input
                  type="number"
                  min={1}
                  max={99}
                  style={{ ...inputStyle, width: 72 }}
                  value={step.afterFailedAttempts ?? i + 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    patchHintPlanAt(i, {
                      afterFailedAttempts: Number.isFinite(n)
                        ? Math.max(1, Math.floor(n))
                        : i + 1,
                    });
                  }}
                />
              </label>
              <button
                type="button"
                style={miniDangerIconStyle}
                onClick={() => removeHintPlanStep(i)}
                title={t("Remove hint step", "Hintstap verwijderen")}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" style={addPlyStyle} onClick={addHintPlanStep}>
        + {t("hint step", "hintstap")}
      </button>

      <label style={labelStyle}>
        {t("Success coach caption", "Coach bij succes")}
        <input
          style={inputStyle}
          value={successCoachPlain}
          onChange={(e) =>
            patchIx({
              successCoachCaption: writeLocalizedText(
                ix.successCoachCaption,
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
          style={inputStyle}
          value={wrongCoachPlain}
          onChange={(e) =>
            patchIx({
              wrongCoachCaption: writeLocalizedText(ix.wrongCoachCaption, language, e.target.value),
            })
          }
        />
      </label>
    </div>
  );
}

const rootStyle: CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #86efac",
  background: "#ecfdf3",
  display: "grid",
  gap: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#166534",
};

const subStyle: CSSProperties = {
  fontSize: 11,
  color: "#4d7c4d",
  margin: 0,
  lineHeight: 1.45,
};

const recorderHintStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#15803d",
  margin: 0,
  lineHeight: 1.45,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#dcfce7",
  border: "1px solid #86efac",
};

const feedbackHintStyle: CSSProperties = {
  fontSize: 10,
  color: "#4d7c4d",
  margin: "-4px 0 0 0",
  lineHeight: 1.4,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#14532d",
  marginTop: 4,
};

const sequenceListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const plyCardStyle: CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #86efac",
  background: "#f8faf9",
  display: "grid",
  gap: 8,
};

const plyHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "nowrap",
};

const plyIndexBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#fff",
  background: "#16a34a",
  borderRadius: 6,
  padding: "2px 8px",
  minWidth: 22,
  textAlign: "center",
};

const plyNotationBtnStyle: CSSProperties = {
  border: "1px solid #86efac",
  background: "#fff",
  color: "#14532d",
  borderRadius: 8,
  padding: "4px 12px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  marginLeft: 2,
  marginRight: "auto",
};

const compactLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  color: "#14532d",
};

const plyAnnotGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
  gap: 8,
  alignItems: "end",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "#14532d",
};

const inlineLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 600,
  color: "#14532d",
};

const inputStyle: CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #86efac",
  minWidth: 0,
};

const miniInsertBtnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #86efac",
  background: "#f0fdf4",
  color: "#166534",
  cursor: "pointer",
};

const miniDangerIconStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fff",
  color: "#b91c1c",
  cursor: "pointer",
};

const addPlyStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #86efac",
  background: "#fff",
  color: "#166534",
  cursor: "pointer",
  justifySelf: "start",
};
