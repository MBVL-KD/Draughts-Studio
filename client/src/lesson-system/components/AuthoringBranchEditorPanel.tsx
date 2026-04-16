import type { CSSProperties } from "react";
import type { LessonBranch } from "../types/authoring/branchTypes";
import type { StepMoment, StepMomentType } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import StepTimelineEditor from "./StepTimelineEditor";

type Props = {
  branch: LessonBranch | undefined;
  language: LanguageCode;
  selectedMomentId: string | null;
  quickAddTypes: readonly StepMomentType[];
  onSelectMoment: (momentId: string | null) => void;
  onApplyBranch: (next: LessonBranch) => void;
  onTimelineChange: (next: StepMoment[]) => void;
  onClose: () => void;
};

export default function AuthoringBranchEditorPanel({
  branch,
  language,
  selectedMomentId,
  quickAddTypes,
  onSelectMoment,
  onApplyBranch,
  onTimelineChange,
  onClose,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  if (!branch) {
    return (
      <div style={rootStyle}>
        <div style={headerRowStyle}>
          <strong>{t("Branch", "Zijlijn")}</strong>
          <button type="button" style={closeBtnStyle} onClick={onClose}>
            {t("Back to step", "Terug naar stap")}
          </button>
        </div>
        <div style={emptyStyle}>{t("Branch not found.", "Zijlijn niet gevonden.")}</div>
      </div>
    );
  }

  const moments = branch.timeline ?? [];
  const titlePlain = readLocalizedText(branch.title, language);
  const descPlain = readLocalizedText(branch.description, language);
  const fen = branch.initialState?.fen ?? "";
  const side = branch.initialState?.sideToMove ?? "white";

  return (
    <div style={rootStyle}>
      <div style={headerRowStyle}>
        <strong style={titleStrongStyle}>{t("Edit branch", "Zijlijn bewerken")}</strong>
        <button type="button" style={closeBtnStyle} onClick={onClose}>
          {t("Back to step", "Terug naar stap")}
        </button>
      </div>

      <div style={metaGridStyle}>
        <label style={labelStyle}>
          {t("Title", "Titel")}
          <input
            type="text"
            style={inputStyle}
            value={titlePlain}
            onChange={(e) =>
              onApplyBranch({
                ...branch,
                title: writeLocalizedText(branch.title, language, e.target.value),
              })
            }
          />
        </label>
        <label style={labelStyle}>
          {t("Description / note", "Beschrijving / notitie")}
          <textarea
            style={textareaStyle}
            rows={3}
            value={descPlain}
            onChange={(e) =>
              onApplyBranch({
                ...branch,
                description: writeLocalizedText(
                  branch.description,
                  language,
                  e.target.value
                ),
              })
            }
          />
        </label>
        <div style={twoColStyle}>
          <label style={labelStyle}>
            {t("Default mode (bundle)", "Standaardmodus (bundel)")}
            <select
              style={inputStyle}
              value={branch.authoringMode ?? "stepSequence"}
              onChange={(e) => {
                const authoringMode = e.target.value as "stepSequence" | "showAndReturn";
                onApplyBranch({ ...branch, authoringMode });
              }}
            >
              <option value="stepSequence">
                {t("Step sequence", "Stappenreeks")}
              </option>
              <option value="showAndReturn">
                {t("Show and return", "Tonen en terug")}
              </option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("Return (bundle)", "Terugkeer (bundel)")}
            <select
              style={inputStyle}
              value={
                branch.authoringReturnPolicy?.type === "resumeNextMoment"
                  ? "resumeNextMoment"
                  : "resumeNextMoment"
              }
              onChange={() =>
                onApplyBranch({
                  ...branch,
                  authoringReturnPolicy: { type: "resumeNextMoment" },
                })
              }
            >
              <option value="resumeNextMoment">
                {t("Resume next moment", "Verder op volgend moment")}
              </option>
            </select>
          </label>
        </div>
        <div style={twoColStyle}>
          <label style={labelStyle}>
            {t("Start FEN", "Start-FEN")}
            <input
              type="text"
              style={inputStyle}
              spellCheck={false}
              value={fen}
              onChange={(e) =>
                onApplyBranch({
                  ...branch,
                  initialState: {
                    ...branch.initialState,
                    fen: e.target.value,
                    sideToMove: branch.initialState?.sideToMove ?? side,
                    variantId: branch.initialState?.variantId,
                    rulesetId: branch.initialState?.rulesetId,
                  },
                })
              }
            />
          </label>
          <label style={labelStyle}>
            {t("Side to move", "Aan zet")}
            <select
              style={inputStyle}
              value={side}
              onChange={(e) =>
                onApplyBranch({
                  ...branch,
                  initialState: {
                    ...branch.initialState,
                    fen: branch.initialState?.fen ?? fen,
                    sideToMove: e.target.value as "white" | "black",
                    variantId: branch.initialState?.variantId,
                    rulesetId: branch.initialState?.rulesetId,
                  },
                })
              }
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
        </div>
      </div>

      <div style={timelineWrapStyle}>
        <StepTimelineEditor
          moments={moments}
          selectedMomentId={selectedMomentId}
          language={language}
          quickAddTypes={quickAddTypes}
          onSelectMoment={onSelectMoment}
          onTimelineChange={onTimelineChange}
        />
      </div>

      <div style={hintStyle}>
        {t(
          "Branch timeline edits are stored on the lesson bundle. No branch playback in the player yet.",
          "Wijzigingen op de zijlijn-tijdlijn worden in de lesbundel opgeslagen. Nog geen afspeel-runtime."
        )}
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #c4b5fd",
  background: "#faf5ff",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 0,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const titleStrongStyle: CSSProperties = { fontSize: 13 };

const closeBtnStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid #ddd6fe",
  background: "#fff",
  color: "#5b21b6",
  cursor: "pointer",
};

const emptyStyle: CSSProperties = { fontSize: 12, color: "#64748b" };

const metaGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "#4c1d95",
};

const inputStyle: CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #ddd6fe",
  background: "#fff",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 56,
};

const timelineWrapStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid #ede9fe",
  background: "#fff",
  padding: 8,
  minHeight: 120,
  maxHeight: 360,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  lineHeight: 1.45,
};
