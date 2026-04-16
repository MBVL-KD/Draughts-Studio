import type { CSSProperties } from "react";
import type { BranchAction } from "../types/authoring/branchTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  /** Bundel 7b: relink `enterBranch` to another branch in the bundle. */
  branchPicker?: {
    choices: { id: string; label: string }[];
    onRelink: (nextBranchId: string) => void;
  };
};

export default function AuthoringBranchActionMomentFields({
  moment,
  language,
  onApply,
  branchPicker: _branchPicker,
}: Props) {
  const ba = moment.branchAction;
  if (!ba) return null;

  const t = (en: string, nl: string) => (language === "nl" ? nl : en);

  const patchBranchAction = (partial: Partial<BranchAction>) => {
    onApply({
      ...moment,
      branchAction: {
        ...ba,
        ...partial,
        returnPolicy: partial.returnPolicy ?? ba.returnPolicy,
      },
    });
  };

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("Branch link", "Zijlijn-koppeling")}</div>
      <div style={rowStyle}>
        <label style={labelStyle}>
          {t("Mode", "Modus")}
          <select
            style={inputStyle}
            value={ba.mode === "inlineMomentSequence" ? "stepSequence" : ba.mode}
            onChange={(e) => {
              const mode = e.target.value as "stepSequence" | "showAndReturn";
              patchBranchAction({ mode });
            }}
          >
            <option value="stepSequence">
              {t("Step sequence (authoring)", "Stappenreeks (authoring)")}
            </option>
            <option value="showAndReturn">
              {t("Show and return", "Tonen en terug")}
            </option>
          </select>
        </label>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>
          {t("Return policy", "Terugkeer")}
          <select
            style={inputStyle}
            value={
              ba.returnPolicy.type === "resumeNextMoment" ? "resumeNextMoment" : "__keep__"
            }
            onChange={(e) => {
              if (e.target.value === "resumeNextMoment") {
                patchBranchAction({ returnPolicy: { type: "resumeNextMoment" } });
              }
            }}
          >
            <option value="resumeNextMoment">
              {t("Resume next moment", "Verder op volgend moment")}
            </option>
            {ba.returnPolicy.type !== "resumeNextMoment" ? (
              <option value="__keep__" disabled>
                {ba.returnPolicy.type} ({t("MVP: switch to resume above", "MVP: kies hierboven")})
              </option>
            ) : null}
          </select>
        </label>
      </div>
      <div style={hintStyle}>
        {t(
          "Branch playback in the player is not wired yet (Bundel 7a = data + editor only).",
          "Afspelen van zijlijnen in de player is nog niet gekoppeld (bundel 7a = data + editor)."
        )}
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fafafa",
  display: "grid",
  gap: 10,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
};

const rowStyle: CSSProperties = { display: "grid", gap: 6 };

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  lineHeight: 1.45,
};
