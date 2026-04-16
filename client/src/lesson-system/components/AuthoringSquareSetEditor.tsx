import type { CSSProperties } from "react";
import type { LanguageCode } from "../types/i18nTypes";
import { sortUniqueSquares, stringifySquareIds } from "../utils/selectionSquareSetHelpers";

export type AuthoringSquareSetVariant = "squares" | "pieces";

type Props = {
  variant: AuthoringSquareSetVariant;
  language: LanguageCode;
  targets: number[];
  onTargetsChange: (next: number[]) => void;
  studioSelection: number[];
  targetPickMode: boolean;
  onTargetPickModeChange: (active: boolean) => void;
  hasClipboard: boolean;
  onCopyTargets: () => void;
  onPasteTargets: () => void;
};

export default function AuthoringSquareSetEditor({
  variant,
  language,
  targets,
  onTargetsChange,
  studioSelection,
  targetPickMode,
  onTargetPickModeChange,
  hasClipboard,
  onCopyTargets,
  onPasteTargets,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  const remove = (sq: number) => {
    onTargetsChange(targets.filter((x) => x !== sq));
  };

  const sortTargets = () => {
    onTargetsChange(sortUniqueSquares(targets));
  };

  const clearTargets = () => {
    onTargetsChange([]);
  };

  const applyStudioToTargets = () => {
    onTargetsChange(sortUniqueSquares(studioSelection));
  };

  const sortedTargets = sortUniqueSquares(targets);

  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={targetPickMode}
            onChange={(e) => onTargetPickModeChange(e.target.checked)}
          />
          {t("Pick targets on board", "Doelen op bord kiezen")}
        </label>
        {targetPickMode ? (
          <span style={hintStyle}>
            {variant === "pieces"
              ? t("Click occupied squares on the board.", "Tik bezette velden op het bord.")
              : t("Click squares on the board to toggle.", "Tik op velden op het bord om te wisselen.")}
          </span>
        ) : null}
      </div>

      <div style={btnRowStyle}>
        <button type="button" style={btnStyle} onClick={applyStudioToTargets}>
          {t("Use board selection as targets", "Gebruik bordselectie als doelen")}
        </button>
        <button type="button" style={btnStyle} onClick={sortTargets}>
          {t("Sort", "Sorteer")}
        </button>
        <button type="button" style={btnStyle} onClick={clearTargets}>
          {t("Clear", "Wissen")}
        </button>
        <button type="button" style={btnStyle} onClick={onCopyTargets}>
          {t("Copy targets", "Kopieer doelen")}
        </button>
        <button type="button" style={btnStyle} disabled={!hasClipboard} onClick={onPasteTargets}>
          {t("Paste targets", "Plak doelen")}
        </button>
      </div>

      <div style={chipWrapStyle}>
        {sortedTargets.length === 0 ? (
          <span style={emptyChipsStyle}>{t("No target squares yet.", "Nog geen doelvelden.")}</span>
        ) : (
          sortedTargets.map((sq) => (
            <button key={sq} type="button" style={chipStyle} onClick={() => remove(sq)} title={t("Remove", "Verwijder")}>
              {sq}
              <span style={chipXStyle}>×</span>
            </button>
          ))
        )}
      </div>

      <label style={labelStyle}>
        {t("Raw list (comma)", "Ruwe lijst (komma)")}
        <input
          type="text"
          style={inputStyle}
          spellCheck={false}
          value={stringifySquareIds(targets)}
          onChange={(e) => onTargetsChange(sortUniqueSquares(parseCommaLocal(e.target.value)))}
        />
      </label>
    </div>
  );
}

function parseCommaLocal(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
}

const wrapStyle: CSSProperties = { display: "grid", gap: 8 };

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const toggleLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
};

const hintStyle: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  maxWidth: 280,
  lineHeight: 1.35,
};

const btnRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const btnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #c4b5fd",
  background: "#fff",
  cursor: "pointer",
  color: "#5b21b6",
};

const chipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  minHeight: 28,
  alignItems: "center",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #a78bfa",
  background: "#ede9fe",
  color: "#4c1d95",
  cursor: "pointer",
};

const chipXStyle: CSSProperties = { fontSize: 12, opacity: 0.7 };

const emptyChipsStyle: CSSProperties = { fontSize: 10, color: "#94a3b8", fontStyle: "italic" };

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  color: "#64748b",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 11,
};
