import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { MoveReference, StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createLocalizedText, readLocalizedText } from "../utils/i18nHelpers";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
};

function moveRefToNotation(mv: MoveReference): string {
  if (mv.type !== "inline") return "";
  const isCapture = (mv.captures?.length ?? 0) > 0;
  const sep = isCapture ? "x" : "-";
  const path = mv.path && mv.path.length >= 2 ? mv.path : [mv.from, mv.to];
  return path.join(sep);
}

function notationToMoveRef(token: string): MoveReference | null {
  const clean = token.trim();
  if (!/^\d+(?:[-x]\d+)+$/.test(clean)) return null;
  const isCapture = clean.includes("x");
  const parts = clean
    .split(/[-x]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 2) return null;
  return {
    type: "inline",
    from: parts[0]!,
    to: parts[parts.length - 1]!,
    path: parts.length > 2 ? parts : undefined,
    captures: isCapture ? [] : undefined,
  };
}

export default function AuthoringShowLineMomentFields({ moment, language, onApply }: Props) {
  if (moment.type !== "showLine" || moment.lineRef?.type !== "inline") return null;
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const notation = useMemo(
    () =>
      moment.lineRef?.type === "inline"
        ? moment.lineRef.moves.map((mv: MoveReference) => moveRefToNotation(mv)).filter(Boolean).join(" ")
        : "",
    [moment.lineRef]
  );

  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>{t("showLine", "showLine")}</div>
      <label style={labelStyle}>
        {t("Line notation", "Lijnnotatie")}
        <textarea
          rows={4}
          style={textareaStyle}
          value={notation}
          onChange={(e) => {
            const raw = e.target.value;
            const moves = raw
              .split(/\s+/)
              .map((tok) => notationToMoveRef(tok))
              .filter((mv): mv is MoveReference => !!mv);
            onApply({
              ...moment,
              title: moment.title ?? createLocalizedText("Imported line", "Geimporteerde lijn"),
              body: createLocalizedText(raw, raw),
              lineRef: { type: "inline", moves },
            });
          }}
        />
      </label>
      <div style={hintStyle}>
        {t(
          "Use notation like: 31-27 18x29 33x24",
          "Gebruik notatie zoals: 31-27 18x29 33x24"
        )}
      </div>
      <div style={metaStyle}>
        {t("Title", "Titel")}: {readLocalizedText(moment.title, language) || "—"} ·{" "}
        {t("Moves", "Zetten")}: {moment.lineRef.moves.length}
      </div>
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

const titleStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: "#0f172a" };
const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 11, color: "#475569" };
const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  minHeight: 80,
};
const hintStyle: CSSProperties = { fontSize: 11, color: "#64748b" };
const metaStyle: CSSProperties = { fontSize: 11, color: "#334155" };
