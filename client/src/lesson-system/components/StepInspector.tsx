import { useState } from "react";
import type { CSSProperties } from "react";
import type { LessonStep } from "../types/stepTypes";
import type { LanguageCode, LocalizedText } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import ValidationEditor from "./editors/ValidationEditor";

type Props = {
  step: LessonStep | null;
  onChange: (nextStep: LessonStep) => void;
  language: LanguageCode;
  /** Shown under Basic for copy/paste (API, debugging). */
  documentContext?: {
    bookId: string;
    bookDocumentId?: string | null;
    lessonId: string;
    lessonDocumentId?: string | null;
  };
};

type SectionKey =
  | "basic"
  | "initial"
  | "validation"
  | "presentation"
  | "feedback"
  | "exam"
  | "analytics";

export default function StepInspector({
  step,
  onChange,
  language,
  documentContext,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    basic: true,
    initial: true,
    validation: true,
    presentation: false,
    feedback: false,
    exam: false,
    analytics: false,
  });

  if (!step) {
    return (
      <section style={panelStyle}>
        <div style={emptyCardStyle}>
          <h2 style={{ marginTop: 0, color: "#111827" }}>Inspector</h2>
          <p style={{ color: "#6b7280", marginBottom: 0 }}>
            {t("Select a step first.", "Selecteer eerst een stap.")}
          </p>
        </div>
      </section>
    );
  }

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updateField = <K extends keyof LessonStep>(key: K, value: LessonStep[K]) => {
    onChange({
      ...step,
      [key]: value,
    });
  };
  const updatePuzzleMetaField = (
    patch: Partial<NonNullable<LessonStep["puzzleMeta"]>>
  ) => {
    const base = step.puzzleMeta ?? {
      puzzleRating: 1100,
      difficultyBand: "intermediate" as const,
      topicTags: ["puzzle"],
      ratingSource: "manual" as const,
    };
    updateField("puzzleMeta", {
      ...base,
      ...patch,
    });
  };

  const updateLocalized = (current: LocalizedText | undefined, nextText: string): LocalizedText =>
    writeLocalizedText(current, language, nextText);

  const handleClearValidation = () => {
    const validation = step.validation;
    switch (validation.type) {
      case "move":
        updateField("validation", { ...validation, correctMoves: [] });
        return;
      case "sequence":
        updateField("validation", { ...validation, moves: [] });
        return;
      case "select_squares":
        updateField("validation", { ...validation, squares: [] });
        return;
      case "select_pieces":
        updateField("validation", { ...validation, pieceSquares: [] });
        return;
      case "multiple_choice":
        updateField("validation", { ...validation, options: [] });
        return;
      case "mark_path":
        updateField("validation", {
          ...validation,
          path: [],
          targetSquare: undefined,
        });
        return;
      case "zone_paint":
        updateField("validation", { ...validation, squares: [] });
        return;
      case "goal":
        updateField("validation", { ...validation, targetSquare: undefined });
        return;
      case "place_pieces":
      case "count":
      case "none":
      default:
        return;
    }
  };

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div style={eyebrowStyle}>Inspector</div>
        <h2 style={titleStyle}>
          {readLocalizedText(step.title, language) || step.type}
        </h2>
      </div>

      <CollapsibleSection
        title={t("Basic", "Basis")}
        isOpen={openSections.basic}
        onToggle={() => toggleSection("basic")}
      >
        {documentContext ? (
          <Field label={t("IDs (book / lesson / step)", "IDs (boek / les / stap)")}>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                lineHeight: 1.5,
                color: "#334155",
                wordBreak: "break-all",
              }}
            >
              <div>
                <strong>book.id</strong> {documentContext.bookId || "—"}
              </div>
              {documentContext.bookDocumentId ? (
                <div>
                  <strong>book.bookId</strong> {documentContext.bookDocumentId}
                </div>
              ) : null}
              <div>
                <strong>lesson.id</strong> {documentContext.lessonId || "—"}
              </div>
              {documentContext.lessonDocumentId ? (
                <div>
                  <strong>lesson.lessonId</strong> {documentContext.lessonDocumentId}
                </div>
              ) : null}
              <div>
                <strong>step.id</strong> {step.id}
              </div>
              {step.stepId ? (
                <div>
                  <strong>step.stepId</strong> {step.stepId}
                </div>
              ) : null}
            </div>
          </Field>
        ) : null}

        <Field label={t("Title", "Titel")}>
          <input
            value={readLocalizedText(step.title, language)}
            onChange={(e) => updateField("title", updateLocalized(step.title, e.target.value))}
            style={inputStyle}
          />
        </Field>

        <Field label={t("Prompt", "Opdracht")}>
          <textarea
            value={readLocalizedText(step.prompt, language)}
            onChange={(e) => updateField("prompt", updateLocalized(step.prompt, e.target.value))}
            style={textareaStyle}
            rows={4}
          />
        </Field>

        <Field label={t("Hint", "Hint")}>
          <textarea
            value={readLocalizedText(step.hint, language)}
            onChange={(e) => updateField("hint", updateLocalized(step.hint, e.target.value))}
            style={textareaStyle}
            rows={3}
          />
        </Field>

        <Field label={t("Explanation", "Uitleg")}>
          <textarea
            value={readLocalizedText(step.explanation, language)}
            onChange={(e) =>
              updateField("explanation", updateLocalized(step.explanation, e.target.value))
            }
            style={textareaStyle}
            rows={4}
          />
        </Field>

        {step.puzzleMeta ? (
          <>
            <Field label={t("Puzzle rating", "Puzzelrating")}>
              <input
                type="number"
                min={400}
                max={2400}
                value={step.puzzleMeta.puzzleRating ?? 1100}
                onChange={(e) =>
                  updatePuzzleMetaField({
                    puzzleRating: Number(e.target.value) || 1100,
                    ratingSource: "manual",
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label={t("Difficulty band", "Moeilijkheidsband")}>
              <select
                value={step.puzzleMeta.difficultyBand ?? "intermediate"}
                onChange={(e) =>
                  updatePuzzleMetaField({
                    difficultyBand: e.target.value as "beginner" | "intermediate" | "advanced",
                    ratingSource: "manual",
                  })
                }
                style={inputStyle}
              >
                <option value="beginner">beginner</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </Field>
            <Field label={t("Topic tags", "Topic tags")}>
              <input
                value={(step.puzzleMeta.topicTags ?? []).join(", ")}
                onChange={(e) =>
                  updatePuzzleMetaField({
                    topicTags: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    ratingSource: "manual",
                  })
                }
                style={inputStyle}
              />
            </Field>
          </>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Initial state", "Beginstand")}
        isOpen={openSections.initial}
        onToggle={() => toggleSection("initial")}
      >
        <Field label="FEN">
          <textarea
            value={step.initialState.fen}
            onChange={(e) =>
              updateField("initialState", {
                ...step.initialState,
                fen: e.target.value,
              })
            }
            style={textareaStyle}
            rows={3}
          />
        </Field>

        <Field label={t("Side to move", "Aan zet")}>
          <select
            value={step.initialState.sideToMove}
            onChange={(e) =>
              updateField("initialState", {
                ...step.initialState,
                sideToMove: e.target.value as "white" | "black",
              })
            }
            style={inputStyle}
          >
            <option value="white">white</option>
            <option value="black">black</option>
          </select>
        </Field>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Validation", "Validatie")}
        isOpen={openSections.validation}
        onToggle={() => toggleSection("validation")}
      >
        <div style={inlineActionsStyle}>
          <button type="button" style={ghostButtonStyle} onClick={handleClearValidation}>
            {t("Clear validation input", "Validatie-invoer wissen")}
          </button>
        </div>
        <ValidationEditor
          stepType={step.type}
          validation={step.validation}
          language={language}
          onChange={(nextValidation) => updateField("validation", nextValidation)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Presentation", "Presentatie")}
        isOpen={openSections.presentation}
        onToggle={() => toggleSection("presentation")}
      >
        <div style={summaryGridStyle}>
          <SummaryChip label={t("Highlights", "Highlights")} value={String(step.presentation?.highlights?.length ?? 0)} />
          <SummaryChip label={t("Arrows", "Pijlen")} value={String(step.presentation?.arrows?.length ?? 0)} />
          <SummaryChip label={t("Routes", "Routes")} value={String(step.presentation?.routes?.length ?? 0)} />
        </div>
        <div style={hintTextStyle}>
          {t(
            "Presentation is edited from the main board editor using modes like Highlight, Arrow and Route.",
            "Presentatie wordt bewerkt vanuit de hoofd-bordeditor met modi zoals Highlight, Pijl en Route."
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Feedback", "Feedback")}
        isOpen={openSections.feedback}
        onToggle={() => toggleSection("feedback")}
      >
        <Field label={t("Correct feedback", "Feedback correct")}>
          <input
            value={readLocalizedText(step.feedback?.correct, language)}
            onChange={(e) =>
              updateField("feedback", {
                ...step.feedback,
                correct: updateLocalized(step.feedback.correct, e.target.value),
              })
            }
            style={inputStyle}
          />
        </Field>

        <Field label={t("Incorrect feedback", "Feedback incorrect")}>
          <input
            value={readLocalizedText(step.feedback?.incorrect, language)}
            onChange={(e) =>
              updateField("feedback", {
                ...step.feedback,
                incorrect: updateLocalized(step.feedback.incorrect, e.target.value),
              })
            }
            style={inputStyle}
          />
        </Field>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Exam behavior", "Examen-gedrag")}
        isOpen={openSections.exam}
        onToggle={() => toggleSection("exam")}
      >
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={step.examBehavior?.disableHints ?? false}
            onChange={(e) =>
              updateField("examBehavior", {
                ...step.examBehavior,
                disableHints: e.target.checked,
              })
            }
          />
          {t("Hints disabled in exam", "Hints uitgeschakeld in examen")}
        </label>

        <Field label={t("Max attempts in exam", "Max pogingen in examen")}>
          <input
            type="number"
            min={1}
            value={step.examBehavior?.maxAttempts ?? ""}
            onChange={(e) =>
              updateField("examBehavior", {
                ...step.examBehavior,
                maxAttempts: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            style={inputStyle}
          />
        </Field>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("Analytics", "Analytics")}
        isOpen={openSections.analytics}
        onToggle={() => toggleSection("analytics")}
      >
        <Field label={t("Tags (comma separated)", "Tags (komma-gescheiden)")}>
          <input
            value={(step.analytics?.tags ?? []).join(", ")}
            onChange={(e) =>
              updateField("analytics", {
                ...step.analytics,
                tags: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            style={inputStyle}
          />
        </Field>
      </CollapsibleSection>
    </section>
  );
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionCardStyle}>
      <button type="button" onClick={onToggle} style={sectionHeaderButtonStyle}>
        <span style={sectionTitleStyle}>{title}</span>
        <span style={sectionChevronStyle}>{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen ? <div style={sectionBodyStyle}>{children}</div> : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={fieldWrapStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryChipStyle}>
      <div style={summaryChipLabelStyle}>{label}</div>
      <div style={summaryChipValueStyle}>{value}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  padding: 18,
  boxSizing: "border-box",
  display: "grid",
  gap: 16,
  color: "#111827",
};

const emptyCardStyle: CSSProperties = {
  border: "1px dashed #cfd8e3",
  borderRadius: 16,
  background: "#fafcff",
  padding: 18,
};

const headerStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.1,
  color: "#111827",
};

const sectionCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 16,
  background: "#fcfdff",
  overflow: "hidden",
};

const sectionHeaderButtonStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  border: "none",
  background: "#f8fbff",
  cursor: "pointer",
  textAlign: "left",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "#111827",
};

const sectionChevronStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1,
  color: "#374151",
  fontWeight: 700,
};

const sectionBodyStyle: CSSProperties = {
  padding: 16,
};

const inlineActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 12,
};

const ghostButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 10px",
  cursor: "pointer",
};

const hintTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 10,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const summaryChipStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 10,
  background: "#f8fafc",
  padding: "10px 12px",
  minHeight: 52,
};

const summaryChipLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
  marginBottom: 3,
};

const summaryChipValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const fieldWrapStyle: CSSProperties = {
  marginBottom: 16,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  background: "#ffffff",
  color: "#111827",
  appearance: "none",
  WebkitTextFillColor: "#111827",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  background: "#ffffff",
  color: "#111827",
  resize: "vertical",
  WebkitTextFillColor: "#111827",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  color: "#111827",
};