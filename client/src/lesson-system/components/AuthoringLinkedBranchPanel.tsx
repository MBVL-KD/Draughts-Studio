import type { CSSProperties } from "react";
import type { LessonBranch } from "../types/authoring/branchTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";

type Props = {
  branch: LessonBranch | undefined;
  language: LanguageCode;
  onInspect: () => void;
  onUnlink: () => void;
};

export default function AuthoringLinkedBranchPanel({
  branch,
  language,
  onInspect,
  onUnlink,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const title = branch
    ? readLocalizedText(branch.title, language).trim() || branch.id.slice(0, 8)
    : t("(missing branch payload)", "(ontbrekende zijlijn)");
  const n = branch?.timeline?.length ?? 0;

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("Linked branch", "Gekoppelde zijlijn")}</div>
      <div style={metaStyle}>
        <strong>{title}</strong>
        <span style={countStyle}>
          · {n} {t("moments", "momenten")}
        </span>
      </div>
      <div style={actionsStyle}>
        <button type="button" style={primaryBtnStyle} onClick={onInspect}>
          {t("Edit branch", "Bewerk zijlijn")}
        </button>
        <button type="button" style={dangerBtnStyle} onClick={onUnlink}>
          {t("Unlink", "Ontkoppelen")}
        </button>
      </div>
      <div style={hintStyle}>
        {t(
          "Unlink removes this link and deletes the branch data from the lesson bundle.",
          "Ontkoppelen verwijdert deze koppeling en de zijlijn-data uit de les."
        )}
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #bfdbfe",
  background: "#f8fafc",
  display: "grid",
  gap: 10,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#1d4ed8",
};

const metaStyle: CSSProperties = {
  fontSize: 13,
  color: "#0f172a",
  lineHeight: 1.4,
};

const countStyle: CSSProperties = { fontWeight: 500, color: "#64748b" };

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const primaryBtnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #93c5fd",
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
};

const dangerBtnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  cursor: "pointer",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  lineHeight: 1.45,
};
