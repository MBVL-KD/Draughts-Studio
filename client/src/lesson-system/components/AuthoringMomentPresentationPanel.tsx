import { useState } from "react";
import type { CSSProperties } from "react";
import type { AuthoringOverlaySpec, StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import {
  AUTHORING_GLYPH_OPTIONS,
  OVERLAY_SEMANTIC_STYLE_OPTIONS,
  appendGlyphMarker,
  appendOverlay,
  createDefaultArrowOverlay,
  createDefaultGlyphMarker,
  createDefaultHighlightOverlay,
  createDefaultLabelOverlay,
  createDefaultRouteOverlay,
  moveGlyphMarkerDown,
  moveGlyphMarkerUp,
  moveOverlayDown,
  moveOverlayUp,
  removeGlyphMarkerAt,
  removeOverlayAt,
  replaceGlyphMarkerAt,
  replaceOverlayAt,
} from "../utils/authoringMomentPresentation";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
};

function parseSquares(raw: string): number[] {
  const parts = raw.split(/[,;\s]+/).map((p) => Number(p.trim()));
  return parts.filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

function formatSquares(sq: number[]): string {
  return sq.join(", ");
}

/** Parses "34-40", "34x40", "34 → 40", "34 40" into endpoints (PD field numbers). */
function parseArrowEndpoints(raw: string): { from: number; to: number } | null {
  const cleaned = raw
    .trim()
    .replace(/[→]/g, "-")
    .replace(/x/gi, "-");
  const parts = cleaned
    .split(/[-–\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
  if (parts.length < 2) return null;
  return { from: parts[0]!, to: parts[parts.length - 1]! };
}

function formatArrowEndpoints(from: number, to: number): string {
  return `${from}–${to}`;
}

function parseSingleSquare(raw: string): number | undefined {
  const n = Number(String(raw).trim().split(/[,;\s]+/)[0]);
  if (!Number.isFinite(n) || n < 1 || n > 50) return undefined;
  return Math.floor(n);
}

export default function AuthoringMomentPresentationPanel({
  moment,
  language,
  onApply,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [collapsed, setCollapsed] = useState(false);
  const overlays = moment.overlays ?? [];
  const glyphs = moment.glyphMarkers ?? [];

  const styleSelect = (value: string, onChange: (v: string) => void) => (
    <select
      style={selectStyle}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {OVERLAY_SEMANTIC_STYLE_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );

  const renderOverlayRow = (o: AuthoringOverlaySpec, index: number) => {
    const patch = (next: AuthoringOverlaySpec) =>
      onApply(replaceOverlayAt(moment, index, next));

    const controls = (
      <div style={rowBtnStyle}>
        <button
          type="button"
          style={miniBtn}
          title={t("Up", "Omhoog")}
          onClick={() => onApply(moveOverlayUp(moment, index))}
        >
          ↑
        </button>
        <button
          type="button"
          style={miniBtn}
          title={t("Down", "Omlaag")}
          onClick={() => onApply(moveOverlayDown(moment, index))}
        >
          ↓
        </button>
        <button
          type="button"
          style={delBtn}
          title={t("Remove", "Verwijderen")}
          onClick={() => onApply(removeOverlayAt(moment, index))}
        >
          ×
        </button>
      </div>
    );

    if (o.type === "highlight") {
      return (
        <div key={o.id ?? `hl-${index}`} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={badgeStyle}>highlight</span>
            {controls}
          </div>
          <label style={lbl}>
            {t("Squares", "Velden")}
            <input
              style={inp}
              value={formatSquares(o.squares)}
              onChange={(e) =>
                patch({ ...o, squares: parseSquares(e.target.value) })
              }
            />
          </label>
          <label style={lbl}>
            {t("Semantic style", "Semantische stijl")}
            {styleSelect(o.style, (v) => patch({ ...o, style: v as typeof o.style }))}
          </label>
          <label style={inlineLbl}>
            <input
              type="checkbox"
              checked={!!o.pulse}
              onChange={(e) => patch({ ...o, pulse: e.target.checked })}
            />
            {t("Pulse", "Puls")}
          </label>
          <label style={lbl}>
            {t("Label (optional)", "Label (optioneel)")}
            <input
              style={inp}
              value={readLocalizedText(o.label, language)}
              onChange={(e) =>
                patch({
                  ...o,
                  label: writeLocalizedText(o.label, language, e.target.value),
                })
              }
            />
          </label>
        </div>
      );
    }

    if (o.type === "arrow") {
      return (
        <div key={o.id ?? `ar-${index}`} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={badgeStyle}>arrow</span>
            {controls}
          </div>
          <label style={lbl}>
            {t("Move (e.g. 34–40 or 34x46)", "Zet (bijv. 34–40 of 34x46)")}
            <input
              key={`${o.id ?? index}-${o.from}-${o.to}`}
              style={inp}
              defaultValue={formatArrowEndpoints(o.from, o.to)}
              placeholder="34–40"
              onBlur={(e) => {
                const p = parseArrowEndpoints(e.target.value);
                if (p) patch({ ...o, from: p.from, to: p.to });
              }}
            />
          </label>
          <label style={lbl}>
            {t("Semantic style", "Semantische stijl")}
            {styleSelect(o.style, (v) => patch({ ...o, style: v as typeof o.style }))}
          </label>
          <label style={inlineLbl}>
            <input
              type="checkbox"
              checked={!!o.dashed}
              onChange={(e) => patch({ ...o, dashed: e.target.checked })}
            />
            {t("Dashed", "Gestippeld")}
          </label>
          <label style={lbl}>
            {t("Label on arrow", "Label op pijl")}
            <input
              style={inp}
              value={readLocalizedText(o.label, language)}
              onChange={(e) =>
                patch({
                  ...o,
                  label: writeLocalizedText(o.label, language, e.target.value),
                })
              }
            />
          </label>
        </div>
      );
    }

    if (o.type === "route") {
      return (
        <div key={o.id ?? `rt-${index}`} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={badgeStyle}>route</span>
            {controls}
          </div>
          <label style={lbl}>
            {t("Path (squares)", "Pad (velden)")}
            <input
              style={inp}
              value={formatSquares(o.path)}
              onChange={(e) =>
                patch({ ...o, path: parseSquares(e.target.value) })
              }
            />
          </label>
          <label style={lbl}>
            {t("Semantic style", "Semantische stijl")}
            {styleSelect(o.style, (v) => patch({ ...o, style: v as typeof o.style }))}
          </label>
          <label style={inlineLbl}>
            <input
              type="checkbox"
              checked={!!o.showDots}
              onChange={(e) => patch({ ...o, showDots: e.target.checked })}
            />
            {t("Show dots", "Toon punten")}
          </label>
        </div>
      );
    }

    if (o.type === "label") {
      return (
        <div key={o.id ?? `lb-${index}`} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={badgeStyle}>label</span>
            {controls}
          </div>
          <label style={lbl}>
            {t("Square", "Veld")}
            <input
              style={inp}
              placeholder="34"
              value={o.square}
              onChange={(e) => {
                const sq = parseSingleSquare(e.target.value);
                if (sq != null) patch({ ...o, square: sq });
              }}
            />
          </label>
          <label style={lbl}>
            {t("Text badge", "Tekstbadge")}
            <input
              style={inp}
              value={readLocalizedText(o.text, language)}
              onChange={(e) =>
                patch({
                  ...o,
                  text: writeLocalizedText(o.text, language, e.target.value),
                })
              }
            />
          </label>
          <label style={lbl}>
            {t("Semantic style", "Semantische stijl")}
            {styleSelect(o.style ?? "neutral", (v) =>
              patch({ ...o, style: v as typeof o.style })
            )}
          </label>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={root}>
      <div style={headRowStyle}>
        <div style={title}>{t("Presentation", "Presentatie")}</div>
        <button type="button" style={collapseBtnStyle} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {collapsed ? null : <p style={hint}>
        {t(
          "Semantic styles map to board colors in preview. Camera / FX playback is out of scope.",
          "Semantische stijlen worden in de preview op bordkleuren gemapt. Camera/FX-playback niet in scope."
        )}
      </p>}

      {collapsed ? null : <div style={sectionTitle}>{t("Overlays", "Overlays")}</div>}
      {collapsed ? null : overlays.length === 0 ? (
        <div style={empty}>{t("No overlays yet.", "Nog geen overlays.")}</div>
      ) : (
        overlays.map((o, i) => renderOverlayRow(o, i))
      )}
      {collapsed ? null : <div style={addRow}>
        <span style={smallLbl}>{t("Add", "Toevoegen")}</span>
        <button
          type="button"
          style={addBtn}
          onClick={() => onApply(appendOverlay(moment, createDefaultHighlightOverlay()))}
        >
          + highlight
        </button>
        <button
          type="button"
          style={addBtn}
          onClick={() => onApply(appendOverlay(moment, createDefaultArrowOverlay()))}
        >
          + arrow
        </button>
        <button
          type="button"
          style={addBtn}
          onClick={() => onApply(appendOverlay(moment, createDefaultRouteOverlay()))}
        >
          + route
        </button>
        <button
          type="button"
          style={addBtn}
          onClick={() => onApply(appendOverlay(moment, createDefaultLabelOverlay()))}
        >
          + label
        </button>
      </div>}

      {collapsed ? null : <div style={sectionTitle}>{t("Glyph markers", "Glyph-markeringen")}</div>}
      {collapsed ? null : glyphs.length === 0 ? (
        <div style={empty}>{t("No glyphs yet.", "Nog geen glyphs.")}</div>
      ) : (
        glyphs.map((g, index) => (
          <div key={g.id ?? `g-${index}`} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span style={badgeStyle}>glyph</span>
              <div style={rowBtnStyle}>
                <button
                  type="button"
                  style={miniBtn}
                  onClick={() => onApply(moveGlyphMarkerUp(moment, index))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={miniBtn}
                  onClick={() => onApply(moveGlyphMarkerDown(moment, index))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  style={delBtn}
                  onClick={() => onApply(removeGlyphMarkerAt(moment, index))}
                >
                  ×
                </button>
              </div>
            </div>
            <label style={lbl}>
              {t("Glyph", "Glyph")}
              <select
                style={selectStyle}
                value={g.glyph}
                onChange={(e) =>
                  onApply(
                    replaceGlyphMarkerAt(moment, index, {
                      ...g,
                      glyph: e.target.value as (typeof AUTHORING_GLYPH_OPTIONS)[number],
                    })
                  )
                }
              >
                {AUTHORING_GLYPH_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label style={lbl}>
              {t("Square (field number)", "Veld (nummer)")}
              <input
                style={inp}
                placeholder="34"
                value={g.square ?? ""}
                onChange={(e) => {
                  const sq = parseSingleSquare(e.target.value);
                  onApply(
                    replaceGlyphMarkerAt(moment, index, {
                      ...g,
                      square: sq,
                    })
                  );
                }}
              />
            </label>
            <label style={lbl}>
              {t("Extra text (optional)", "Extra tekst (optioneel)")}
              <input
                style={inp}
                value={readLocalizedText(g.text, language)}
                onChange={(e) =>
                  onApply(
                    replaceGlyphMarkerAt(moment, index, {
                      ...g,
                      text: writeLocalizedText(g.text, language, e.target.value),
                    })
                  )
                }
              />
            </label>
          </div>
        ))
      )}
      {collapsed ? null : <button
        type="button"
        style={addBtnWide}
        onClick={() => onApply(appendGlyphMarker(moment, createDefaultGlyphMarker()))}
      >
        {t("+ Glyph marker", "+ Glyph-markering")}
      </button>}
    </div>
  );
}

const root: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const title: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#0369a1",
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

const hint: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  margin: 0,
  lineHeight: 1.45,
};

const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#334155",
  marginTop: 4,
};

const empty: CSSProperties = { fontSize: 11, color: "#94a3b8", fontStyle: "italic" };

const cardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 8,
  background: "#fff",
  display: "grid",
  gap: 6,
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const badgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const lbl: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
};

const inlineLbl: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
};

const inp: CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
};

const selectStyle: CSSProperties = {
  ...inp,
  maxWidth: 200,
};

const rowBtnStyle: CSSProperties = { display: "flex", gap: 4 };

const miniBtn: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
};

const delBtn: CSSProperties = {
  ...miniBtn,
  borderColor: "#fecaca",
  color: "#b91c1c",
};

const addRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const smallLbl: CSSProperties = { fontSize: 10, fontWeight: 700, color: "#64748b" };

const addBtn: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid #93c5fd",
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
};

const addBtnWide: CSSProperties = {
  ...addBtn,
  alignSelf: "flex-start",
};
