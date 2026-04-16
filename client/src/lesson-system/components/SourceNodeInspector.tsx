import { useState } from "react";
import type { CSSProperties } from "react";
import type { AnalysisNode, MoveGlyph, SourceMetadata } from "../types/analysisTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import { uiText } from "../i18n/studioUiText";

type Props = {
  node: AnalysisNode | null;
  sourceMeta?: SourceMetadata;
  language?: LanguageCode;
  onChangeSourceMetaField: (field: keyof SourceMetadata, value: string) => void;
  onChangeGlyph: (glyph: MoveGlyph | "") => void;
  onChangeComment: (value: string) => void;
  onChangePreMoveComment: (value: string) => void;
};

const GLYPH_OPTIONS: Array<MoveGlyph | ""> = ["", "!", "?", "!!", "??", "!?", "?!"];
const RESULT_OPTIONS = ["", "2-0", "0-2", "1-1", "0-0", "*"] as const;

function getNodeTitle(node: AnalysisNode | null, language: LanguageCode) {
  if (!node) return uiText(language, "sourceNoNodeSelected");
  if (node.plyIndex === 0) return uiText(language, "sourceRootPosition");
  return node.move?.notation || `${uiText(language, "sourcePly")} ${node.plyIndex}`;
}

export default function SourceNodeInspector({
  node,
  sourceMeta,
  language = "nl",
  onChangeSourceMetaField,
  onChangeGlyph,
  onChangeComment,
  onChangePreMoveComment,
}: Props) {
  const currentGlyph = node?.glyphs?.[0] ?? "";
  const [openSections, setOpenSections] = useState({
    nodeInfo: false,
    glyph: true,
    preMove: true,
    postMove: true,
    gameMeta: true,
    fen: false,
    engine: false,
    teaching: false,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={rootStyle}>
      <style>{`
        .smart-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .smart-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .smart-scroll:hover {
          scrollbar-width: thin;
        }
        .smart-scroll:hover::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .smart-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.45);
          border-radius: 999px;
        }
        .smart-scroll:hover::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      <div style={headerStyle}>
        <div style={eyebrowStyle}>Inspector</div>
        <div style={titleStyle}>{getNodeTitle(node, language)}</div>
      </div>

      {!node ? (
        <div style={emptyStateStyle}>
          <div style={emptyTitleStyle}>{uiText(language, "sourceNoNodeSelected")}</div>
          <div style={emptyTextStyle}>
            Select a move in the move text or on the board to inspect it here.
          </div>
        </div>
      ) : (
        <div className="smart-scroll" style={contentStyle}>
          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("nodeInfo")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Node info</span>
              <span style={sectionChevronStyle}>{openSections.nodeInfo ? "▾" : "▸"}</span>
            </button>
            {openSections.nodeInfo ? (
              <>
                <InfoRow label="Node type" value={node.plyIndex === 0 ? "Root" : node.isMainline !== false ? "Main line" : "Variation"} />
                <InfoRow label="Ply" value={String(node.plyIndex)} />
                <InfoRow label="Parent" value={node.parentId ?? "—"} />
                <InfoRow label="Children" value={String(node.childrenIds.length)} />
                <InfoRow label="Variation of" value={node.variationOf ?? "—"} />
                <InfoRow label="Move" value={node.move?.notation ?? "—"} />
              </>
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("glyph")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Glyph</span>
              <span style={sectionChevronStyle}>{openSections.glyph ? "▾" : "▸"}</span>
            </button>
            {openSections.glyph ? (
              <>
                <div style={glyphRowStyle}>
                  {GLYPH_OPTIONS.map((glyph) => {
                    const active = currentGlyph === glyph;

                    return (
                      <button
                        key={glyph || "none"}
                        type="button"
                        onClick={() => onChangeGlyph(glyph)}
                        style={active ? activeGlyphButtonStyle : glyphButtonStyle}
                      >
                        {glyph || "—"}
                      </button>
                    );
                  })}
                </div>

                <div style={hintTextStyle}>Klik om glyph direct op deze node te zetten.</div>
              </>
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("preMove")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Pre-move comment</span>
              <span style={sectionChevronStyle}>{openSections.preMove ? "▾" : "▸"}</span>
            </button>
            {openSections.preMove ? (
              <textarea
                value={readText(node.preMoveComment, language)}
                onChange={(e) => onChangePreMoveComment(e.target.value)}
                rows={4}
                placeholder={
                  language === "nl"
                    ? "Commentaar dat voor deze zet wordt getoond..."
                    : "Comment shown before this move..."
                }
                style={textareaStyle}
              />
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("postMove")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Post-move comment</span>
              <span style={sectionChevronStyle}>{openSections.postMove ? "▾" : "▸"}</span>
            </button>
            {openSections.postMove ? (
              <textarea
                value={readText(node.comment, language)}
                onChange={(e) => onChangeComment(e.target.value)}
                rows={6}
                placeholder={
                  language === "nl"
                    ? "Commentaar voor deze node..."
                    : "Comment for this node..."
                }
                style={textareaStyle}
              />
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("gameMeta")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Game metadata</span>
              <span style={sectionChevronStyle}>{openSections.gameMeta ? "▾" : "▸"}</span>
            </button>
            {openSections.gameMeta ? (
              <div style={stackStyle}>
                <MetaInput label="White" value={sourceMeta?.white ?? ""} onChange={(value) => onChangeSourceMetaField("white", value)} />
                <MetaInput label="Black" value={sourceMeta?.black ?? ""} onChange={(value) => onChangeSourceMetaField("black", value)} />
                <MetaSelect
                  label="Result"
                  value={sourceMeta?.result ?? ""}
                  options={RESULT_OPTIONS}
                  onChange={(value) => onChangeSourceMetaField("result", value)}
                />
                <MetaInput label="Event" value={sourceMeta?.event ?? ""} onChange={(value) => onChangeSourceMetaField("event", value)} />
                <MetaInput label="Date" value={sourceMeta?.date ?? ""} onChange={(value) => onChangeSourceMetaField("date", value)} />
                <MetaInput label="Round" value={sourceMeta?.round ?? ""} onChange={(value) => onChangeSourceMetaField("round", value)} />
                <MetaInput label="Site" value={sourceMeta?.site ?? ""} onChange={(value) => onChangeSourceMetaField("site", value)} />
              </div>
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("fen")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>FEN after node</span>
              <span style={sectionChevronStyle}>{openSections.fen ? "▾" : "▸"}</span>
            </button>
            {openSections.fen ? <div style={fenBoxStyle}>{node.fenAfter || "—"}</div> : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("engine")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Engine</span>
              <span style={sectionChevronStyle}>{openSections.engine ? "▾" : "▸"}</span>
            </button>
            {openSections.engine ? (
              node.engine ? (
                <div style={stackStyle}>
                  <InfoRow label="Status" value={node.engine.status} />
                  <InfoRow label="Best move" value={node.engine.bestMove ?? "—"} />
                  <InfoRow label="Live move" value={node.engine.liveMove ?? "—"} />
                  <InfoRow label="Ponder" value={node.engine.ponderMove ?? "—"} />
                  <InfoRow
                    label="Eval"
                    value={
                      typeof node.engine.evaluation === "number"
                        ? String(node.engine.evaluation)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Depth"
                    value={node.engine.depth != null ? String(node.engine.depth) : "—"}
                  />
                </div>
              ) : (
                <div style={emptyMiniStyle}>
                  No engine snapshot on this node yet.
                </div>
              )
            ) : null}
          </section>

          <section style={cardStyle}>
            <button type="button" onClick={() => toggleSection("teaching")} style={sectionHeaderButtonStyle}>
              <span style={sectionTitleStyle}>Teaching / labels</span>
              <span style={sectionChevronStyle}>{openSections.teaching ? "▾" : "▸"}</span>
            </button>
            {openSections.teaching ? (
              node.labels?.length || node.teaching ? (
                <div style={stackStyle}>
                  <InfoRow
                    label="Labels"
                    value={node.labels?.length ? node.labels.join(", ") : "—"}
                  />
                  <InfoRow
                    label="Critical"
                    value={node.teaching?.isCritical ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="Puzzle start"
                    value={node.teaching?.isPuzzleStart ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="Puzzle solution"
                    value={node.teaching?.isPuzzleSolution ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="Motifs"
                    value={node.teaching?.motifTags?.length ? node.teaching.motifTags.join(", ") : "—"}
                  />
                </div>
              ) : (
                <div style={emptyMiniStyle}>
                  No teaching metadata yet.
                </div>
              )
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

function MetaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={metaLabelWrapStyle}>
      <span style={metaInlineLabelStyle}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={metaInputStyle}
      />
    </label>
  );
}

function MetaSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const safeValue = options.includes(value) ? value : "";
  return (
    <label style={metaLabelWrapStyle}>
      <span style={metaInlineLabelStyle}>{label}</span>
      <select
        value={safeValue}
        onChange={(event) => onChange(event.target.value)}
        style={metaInputStyle}
      >
        {options.map((option) => (
          <option key={option || "empty"} value={option}>
            {option || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

function readText(value: any, language: LanguageCode): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.values) return readLocalizedText(value, language);
  return "";
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "72px minmax(0, 1fr)",
  background: "#fbfcfe",
};

const headerStyle: CSSProperties = {
  borderBottom: "1px solid #dbe3ec",
  padding: "10px 14px",
  background: "#fcfdff",
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
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const contentStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  padding: 14,
  display: "grid",
  gap: 12,
  alignContent: "start",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 14,
  background: "#fff",
  padding: 14,
  display: "grid",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const sectionHeaderButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
};

const sectionChevronStyle: CSSProperties = {
  fontSize: 14,
  color: "#64748b",
  fontWeight: 800,
};

const infoRowStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111827",
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const glyphRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const glyphButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
  fontSize: 13,
  fontWeight: 800,
  color: "#111827",
  minWidth: 40,
  cursor: "pointer",
};

const activeGlyphButtonStyle: CSSProperties = {
  ...glyphButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  background: "#fff",
  color: "#111827",
  resize: "vertical",
};

const fenBoxStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  background: "#f8fafc",
  padding: 10,
  fontSize: 12,
  color: "#334155",
  lineHeight: 1.5,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  wordBreak: "break-word",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  padding: 20,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 8,
};

const emptyTextStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.5,
  maxWidth: 280,
};

const emptyMiniStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.45,
};

const hintTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.45,
};

const metaLabelWrapStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const metaInlineLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const metaInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  color: "#111827",
  background: "#fff",
};