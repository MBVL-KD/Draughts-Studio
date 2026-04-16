import type { CSSProperties } from "react";
import type { LessonStepType } from "../../types/stepTypes";
import type { LanguageCode } from "../../types/i18nTypes";
import type { StepValidation } from "../../types/validationTypes";
import {
  createLocalizedText,
  readLocalizedText,
  writeLocalizedText,
} from "../../utils/i18nHelpers";

type Props = {
  stepType: LessonStepType;
  validation: StepValidation;
  language: LanguageCode;
  onChange: (next: StepValidation) => void;
};

export default function ValidationEditor({
  stepType,
  validation,
  language,
  onChange,
}: Props) {
  const ensureType = (nextType: StepValidation["type"]) => {
    onChange(defaultValidationForEditor(stepType, nextType));
  };

  return (
    <div style={stackStyle}>
      <section style={cardStyle}>
        <Field label="Validation type">
          <select
            value={validation.type}
            onChange={(e) =>
              ensureType(e.target.value as StepValidation["type"])
            }
            style={inputStyle}
          >
            {allowedValidationTypesForStep(stepType).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section style={cardStyle}>
        {renderValidationForm(validation, language, onChange)}
      </section>
    </div>
  );
}

function renderValidationForm(
  validation: StepValidation,
  language: LanguageCode,
  onChange: (next: StepValidation) => void
) {
  switch (validation.type) {
    case "none":
      return <div style={mutedStyle}>This step has no answer validation.</div>;

    case "move":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact" | "allowed_set",
                })
              }
              style={inputStyle}
            >
              <option value="exact">exact</option>
              <option value="allowed_set">allowed_set</option>
            </select>
          </Field>

          <Field label="Correct moves (comma separated)">
            <input
              value={validation.correctMoves.join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  correctMoves: parseStringList(e.target.value),
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    case "sequence":
      return (
        <div style={gridStyle}>
          <Field label="Moves (comma separated)">
            <input
              value={validation.moves.join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  moves: parseStringList(e.target.value),
                })
              }
              style={inputStyle}
            />
          </Field>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={!!validation.allowBranches}
              onChange={(e) =>
                onChange({
                  ...validation,
                  allowBranches: e.target.checked,
                })
              }
            />
            Allow branches
          </label>
        </div>
      );

    case "count":
      return (
        <div style={gridStyle}>
          <Field label="Count type">
            <select
              value={validation.countType}
              onChange={(e) =>
                onChange({
                  ...validation,
                  countType: e.target.value as typeof validation.countType,
                })
              }
              style={inputStyle}
            >
              <option value="legal_moves">legal_moves</option>
              <option value="captures">captures</option>
              <option value="movable_pieces">movable_pieces</option>
              <option value="controlled_squares">controlled_squares</option>
            </select>
          </Field>

          <Field label="Expected">
            <input
              type="number"
              value={validation.expected}
              onChange={(e) =>
                onChange({
                  ...validation,
                  expected: Number(e.target.value || 0),
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    case "select_squares":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact" | "contains_all",
                })
              }
              style={inputStyle}
            >
              <option value="exact">exact</option>
              <option value="contains_all">contains_all</option>
            </select>
          </Field>

          <Field label="Squares (comma separated)">
            <input
              value={validation.squares.join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  squares: parseNumberList(e.target.value),
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    case "select_pieces":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact" | "contains_all",
                })
              }
              style={inputStyle}
            >
              <option value="exact">exact</option>
              <option value="contains_all">contains_all</option>
            </select>
          </Field>

          <Field label="Piece squares (comma separated)">
            <input
              value={validation.pieceSquares.join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  pieceSquares: parseNumberList(e.target.value),
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    case "multiple_choice":
      return (
        <div style={gridStyle}>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={!!validation.allowMultiple}
              onChange={(e) =>
                onChange({
                  ...validation,
                  allowMultiple: e.target.checked,
                })
              }
            />
            Allow multiple correct answers
          </label>

          <div style={{ display: "grid", gap: 12 }}>
            {validation.options.map((option, index) => (
              <div key={option.id} style={miniCardStyle}>
                <div style={miniCardTitleStyle}>Option {index + 1}</div>

                <Field label="Label">
                  <input
                    value={readLocalizedText(option.label, language)}
                    onChange={(e) =>
                      onChange({
                        ...validation,
                        options: validation.options.map((item) =>
                          item.id === option.id
                            ? {
                                ...item,
                                label: writeLocalizedText(
                                  item.label,
                                  language,
                                  e.target.value
                                ),
                              }
                            : item
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </Field>

                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={option.isCorrect}
                    onChange={(e) =>
                      onChange({
                        ...validation,
                        options: validation.options.map((item) =>
                          item.id === option.id
                            ? { ...item, isCorrect: e.target.checked }
                            : item
                        ),
                      })
                    }
                  />
                  Correct
                </label>

                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...validation,
                      options: validation.options.filter((item) => item.id !== option.id),
                    })
                  }
                  style={dangerButtonStyle}
                >
                  Delete option
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                onChange({
                  ...validation,
                  options: [
                    ...validation.options,
                    {
                      id: crypto.randomUUID(),
                      label: createLocalizedText(
                        `Option ${validation.options.length + 1}`,
                        ""
                      ),
                      isCorrect: false,
                    },
                  ],
                })
              }
              style={secondaryButtonStyle}
            >
              + Option
            </button>
          </div>
        </div>
      );

    case "place_pieces":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact" | "goal",
                })
              }
              style={inputStyle}
            >
              <option value="exact">exact</option>
              <option value="goal">goal</option>
            </select>
          </Field>

          <Field label="Piece bank">
            <textarea
              value={validation.pieceBank
                .map((item) => `${item.piece}:${item.count}`)
                .join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  pieceBank: parsePieceBank(e.target.value),
                })
              }
              style={textareaStyle}
              rows={3}
            />
          </Field>

          {validation.mode === "exact" ? (
            <Field label="Exact FEN">
              <textarea
                value={validation.exactFen ?? ""}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    exactFen: e.target.value,
                  })
                }
                style={textareaStyle}
                rows={3}
              />
            </Field>
          ) : (
            <>
              <Field label="Goal type">
                <select
                  value={validation.goalType ?? "opponent_no_legal_moves"}
                  onChange={(e) =>
                    onChange({
                      ...validation,
                      goalType: e.target.value as NonNullable<typeof validation.goalType>,
                    })
                  }
                  style={inputStyle}
                >
                  <option value="opponent_no_legal_moves">opponent_no_legal_moves</option>
                  <option value="force_capture">force_capture</option>
                  <option value="create_promotion_threat">create_promotion_threat</option>
                  <option value="win_material">win_material</option>
                </select>
              </Field>

              <Field label="Side to test">
                <select
                  value={validation.sideToTest ?? "black"}
                  onChange={(e) =>
                    onChange({
                      ...validation,
                      sideToTest: e.target.value as "white" | "black",
                    })
                  }
                  style={inputStyle}
                >
                  <option value="white">white</option>
                  <option value="black">black</option>
                </select>
              </Field>
            </>
          )}
        </div>
      );

    case "mark_path":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact_path" | "reaches_goal",
                })
              }
              style={inputStyle}
            >
              <option value="exact_path">exact_path</option>
              <option value="reaches_goal">reaches_goal</option>
            </select>
          </Field>

          {validation.mode === "exact_path" ? (
            <Field label="Path (comma separated)">
              <input
                value={(validation.path ?? []).join(", ")}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    path: parseNumberList(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </Field>
          ) : (
            <>
              <Field label="Goal">
                <select
                  value={validation.goal ?? "promotion"}
                  onChange={(e) =>
                    onChange({
                      ...validation,
                      goal: e.target.value as NonNullable<typeof validation.goal>,
                    })
                  }
                  style={inputStyle}
                >
                  <option value="promotion">promotion</option>
                  <option value="capture_route">capture_route</option>
                  <option value="escape_route">escape_route</option>
                  <option value="target_square">target_square</option>
                </select>
              </Field>

              <Field label="Target square">
                <input
                  type="number"
                  value={validation.targetSquare ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...validation,
                      targetSquare: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  style={inputStyle}
                />
              </Field>
            </>
          )}
        </div>
      );

    case "zone_paint":
      return (
        <div style={gridStyle}>
          <Field label="Mode">
            <select
              value={validation.mode}
              onChange={(e) =>
                onChange({
                  ...validation,
                  mode: e.target.value as "exact" | "contains_all",
                })
              }
              style={inputStyle}
            >
              <option value="exact">exact</option>
              <option value="contains_all">contains_all</option>
            </select>
          </Field>

          <Field label="Squares (comma separated)">
            <input
              value={validation.squares.join(", ")}
              onChange={(e) =>
                onChange({
                  ...validation,
                  squares: parseNumberList(e.target.value),
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    case "goal":
      return (
        <div style={gridStyle}>
          <Field label="Goal type">
            <select
              value={validation.goalType}
              onChange={(e) =>
                onChange({
                  ...validation,
                  goalType: e.target.value as typeof validation.goalType,
                })
              }
              style={inputStyle}
            >
              <option value="no_legal_moves">no_legal_moves</option>
              <option value="force_capture">force_capture</option>
              <option value="promote_in_one">promote_in_one</option>
              <option value="win_material">win_material</option>
              <option value="reach_square">reach_square</option>
            </select>
          </Field>

          <Field label="Side to test">
            <select
              value={validation.sideToTest ?? "black"}
              onChange={(e) =>
                onChange({
                  ...validation,
                  sideToTest: e.target.value as "white" | "black",
                })
              }
              style={inputStyle}
            >
              <option value="white">white</option>
              <option value="black">black</option>
            </select>
          </Field>

          <Field label="Target square">
            <input
              type="number"
              value={validation.targetSquare ?? ""}
              onChange={(e) =>
                onChange({
                  ...validation,
                  targetSquare: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              style={inputStyle}
            />
          </Field>
        </div>
      );

    default:
      return <div style={mutedStyle}>Unknown validation config.</div>;
  }
}

function allowedValidationTypesForStep(stepType: LessonStepType): StepValidation["type"][] {
  switch (stepType) {
    case "explain":
    case "demo":
      return ["none"];
    case "move":
      return ["move"];
    case "sequence":
      return ["sequence"];
    case "count":
      return ["count"];
    case "select_squares":
      return ["select_squares"];
    case "select_pieces":
      return ["select_pieces"];
    case "multiple_choice":
      return ["multiple_choice"];
    case "place_pieces":
      return ["place_pieces"];
    case "mark_path":
      return ["mark_path"];
    case "zone_paint":
      return ["zone_paint"];
    case "goal_challenge":
      return ["goal"];
    default:
      return ["none"];
  }
}

function defaultValidationForEditor(
  stepType: LessonStepType,
  nextType: StepValidation["type"]
): StepValidation {
  if (!allowedValidationTypesForStep(stepType).includes(nextType)) {
    return { type: "none" };
  }

  switch (nextType) {
    case "none":
      return { type: "none" };

    case "move":
      return { type: "move", mode: "exact", correctMoves: [] };

    case "sequence":
      return { type: "sequence", moves: [], allowBranches: false };

    case "count":
      return { type: "count", countType: "legal_moves", expected: 0 };

    case "select_squares":
      return { type: "select_squares", mode: "exact", squares: [] };

    case "select_pieces":
      return { type: "select_pieces", mode: "exact", pieceSquares: [] };

    case "multiple_choice":
      return {
        type: "multiple_choice",
        allowMultiple: false,
        options: [
          {
            id: crypto.randomUUID(),
            label: createLocalizedText("Option A", ""),
            isCorrect: true,
          },
          {
            id: crypto.randomUUID(),
            label: createLocalizedText("Option B", ""),
            isCorrect: false,
          },
        ],
      };

    case "place_pieces":
      return {
        type: "place_pieces",
        mode: "goal",
        pieceBank: [{ piece: "wm", count: 1 }],
        goalType: "opponent_no_legal_moves",
        sideToTest: "black",
      };

    case "mark_path":
      return {
        type: "mark_path",
        mode: "exact_path",
        path: [],
      };

    case "zone_paint":
      return {
        type: "zone_paint",
        mode: "exact",
        squares: [],
      };

    case "goal":
      return {
        type: "goal",
        goalType: "no_legal_moves",
        sideToTest: "black",
      };

    default:
      return { type: "none" };
  }
}

function parseStringList(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseNumberList(text: string): number[] {
  return text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
}

function parsePieceBank(
  text: string
): Array<{ piece: "wm" | "wk" | "bm" | "bk"; count: number }> {
  const allowed = new Set(["wm", "wk", "bm", "bk"]);

  return text
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((entry) => {
      const [pieceRaw, countRaw] = entry.split(":").map((s) => s.trim());
      const piece = pieceRaw as "wm" | "wk" | "bm" | "bk";
      const count = Number(countRaw ?? 0);

      if (!allowed.has(piece) || !Number.isFinite(count)) {
        return null;
      }

      return { piece, count };
    })
    .filter(
      (
        item
      ): item is { piece: "wm" | "wk" | "bm" | "bk"; count: number } => !!item
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
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const miniCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  padding: 12,
  background: "#f9fafb",
  display: "grid",
  gap: 10,
};

const miniCardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#111827",
  WebkitTextFillColor: "#111827",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#111827",
  resize: "vertical",
  WebkitTextFillColor: "#111827",
};

const labelStyle: CSSProperties = {
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
  color: "#111827",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const mutedStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
};