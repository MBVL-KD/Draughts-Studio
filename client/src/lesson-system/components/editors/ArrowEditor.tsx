import type { CSSProperties } from "react";
import type { ArrowSpec } from "../../types/presentationTypes";

type Props = {
  arrows?: ArrowSpec[] | null;
  activeArrowId?: string | null;
  pendingArrowFrom?: number | null;
  onChange: (next: ArrowSpec[]) => void;
  onSetActiveArrowId: (id: string | null) => void;
  onResetPendingArrow: () => void;
};

export default function ArrowEditor({
  arrows,
  activeArrowId,
  pendingArrowFrom,
  onChange,
  onSetActiveArrowId,
  onResetPendingArrow,
}: Props) {
  const safeArrows = Array.isArray(arrows) ? arrows : [];

  const addArrow = () => {
    const next: ArrowSpec = {
      id: crypto.randomUUID(),
      from: null,
      to: null,
      color: "success",
      curved: false,
      dashed: false,
      label: "",
    };

    const updated = [...safeArrows, next];
    onChange(updated);
    onSetActiveArrowId(next.id);
  };

  const updateArrow = (id: string, patch: Partial<ArrowSpec>) => {
    onChange(
      safeArrows.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeArrow = (id: string) => {
    const updated = safeArrows.filter((item) => item.id !== id);
    onChange(updated);

    if (activeArrowId === id) {
      onSetActiveArrowId(updated[0]?.id ?? null);
    }
  };

  return (
    <div style={sectionStyle}>
      <div style={headerRowStyle}>
        <strong style={sectionTitleStyle}>Arrows</strong>
        <button type="button" onClick={addArrow} style={buttonStyle}>
          + Arrow
        </button>
      </div>

      <div style={hintStyle}>
        Arrow mode: click the start square first, then the end square. Pending from:{" "}
        {pendingArrowFrom ?? "-"}
      </div>

      <button
        type="button"
        onClick={onResetPendingArrow}
        style={secondaryButtonStyle}
      >
        Reset arrow pick
      </button>

      {safeArrows.length === 0 ? (
        <div style={emptyStyle}>
          No arrows yet. Click + Arrow or click directly on the board in Arrow
          mode.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {safeArrows.map((item, index) => {
            const isActive = item.id === activeArrowId;

            return (
              <div
                key={item.id}
                style={{ ...cardStyle, ...(isActive ? activeCardStyle : null) }}
              >
                <div style={headerRowStyle}>
                  <button
                    type="button"
                    onClick={() => onSetActiveArrowId(item.id)}
                    style={pickButtonStyle(isActive)}
                  >
                    {isActive ? "Active" : "Set active"}
                  </button>

                  <strong style={itemTitleStyle}>Arrow {index + 1}</strong>

                  <button
                    type="button"
                    onClick={() => removeArrow(item.id)}
                    style={dangerButtonStyle}
                  >
                    Delete
                  </button>
                </div>

                <div style={grid2Style}>
                  <label style={fieldStyle}>
                    From
                    <input
                      style={inputStyle}
                      value={item.from ?? ""}
                      onChange={(e) =>
                        updateArrow(item.id, {
                          from: toNumberOrNull(e.target.value),
                        })
                      }
                    />
                  </label>

                  <label style={fieldStyle}>
                    To
                    <input
                      style={inputStyle}
                      value={item.to ?? ""}
                      onChange={(e) =>
                        updateArrow(item.id, {
                          to: toNumberOrNull(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>

                <label style={fieldStyle}>
                  Color
                  <select
                    style={inputStyle}
                    value={item.color ?? "success"}
                    onChange={(e) =>
                      updateArrow(item.id, {
                        color: e.target.value as ArrowSpec["color"],
                      })
                    }
                  >
                    <option value="primary">primary</option>
                    <option value="success">success</option>
                    <option value="warning">warning</option>
                    <option value="danger">danger</option>
                    <option value="info">info</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  Label
                  <input
                    style={inputStyle}
                    value={item.label ?? ""}
                    onChange={(e) =>
                      updateArrow(item.id, {
                        label: e.target.value,
                      })
                    }
                  />
                </label>

                <div style={toggleRowStyle}>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.curved}
                      onChange={(e) =>
                        updateArrow(item.id, {
                          curved: e.target.checked,
                        })
                      }
                    />
                    Curved
                  </label>

                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.dashed}
                      onChange={(e) =>
                        updateArrow(item.id, {
                          dashed: e.target.checked,
                        })
                      }
                    />
                    Dashed
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function toNumberOrNull(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  color: "#111827",
};

const itemTitleStyle: CSSProperties = {
  color: "#111827",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  padding: 12,
  background: "#f9fafb",
  display: "grid",
  gap: 10,
};

const activeCardStyle: CSSProperties = {
  border: "2px solid #4f46e5",
  boxShadow: "0 0 0 3px rgba(79,70,229,0.1)",
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

const grid2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  border: "1px dashed #cfd8e3",
  borderRadius: 12,
  padding: 14,
  color: "#6b7280",
  background: "#fafcff",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const pickButtonStyle = (active: boolean): CSSProperties => ({
  border: active ? "2px solid #4f46e5" : "1px solid #d0d7e2",
  background: active ? "#eef2ff" : "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});