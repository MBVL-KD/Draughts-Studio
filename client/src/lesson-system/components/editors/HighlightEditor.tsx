import type { CSSProperties, ReactNode } from "react";
import type { HighlightSpec } from "../../types/presentationTypes";

type Props = {
  highlights?: HighlightSpec[] | null;
  activeHighlightId?: string | null;
  onChange: (next: HighlightSpec[]) => void;
  onSetActiveHighlightId: (id: string | null) => void;
};

export default function HighlightEditor({
  highlights,
  activeHighlightId,
  onChange,
  onSetActiveHighlightId,
}: Props) {
  const safeHighlights = Array.isArray(highlights) ? highlights : [];

  const addHighlight = () => {
    const next: HighlightSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "primary",
      pulse: false,
      fill: true,
      outline: true,
    };

    const updated = [...safeHighlights, next];
    onChange(updated);
    onSetActiveHighlightId(next.id);
  };

  const updateHighlight = (id: string, patch: Partial<HighlightSpec>) => {
    onChange(
      safeHighlights.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeHighlight = (id: string) => {
    const updated = safeHighlights.filter((item) => item.id !== id);
    onChange(updated);

    if (activeHighlightId === id) {
      onSetActiveHighlightId(updated[0]?.id ?? null);
    }
  };

  return (
    <div style={sectionStyle}>
      <div style={headerRowStyle}>
        <strong style={sectionTitleStyle}>Highlight list</strong>
        <button type="button" onClick={addHighlight} style={secondaryButtonStyle}>
          + Highlight
        </button>
      </div>

      {safeHighlights.length === 0 ? (
        <EmptyState text="No highlights yet. Click + Highlight or click the board in Highlight mode to create one automatically." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {safeHighlights.map((item, index) => {
            const isActive = item.id === activeHighlightId;

            return (
              <div
                key={item.id}
                style={{ ...cardStyle, ...(isActive ? activeCardStyle : null) }}
              >
                <div style={headerRowStyle}>
                  <button
                    type="button"
                    onClick={() => onSetActiveHighlightId(item.id)}
                    style={pickButtonStyle(isActive)}
                  >
                    {isActive ? "Active" : "Set active"}
                  </button>

                  <div style={itemTitleStyle}>Highlight {index + 1}</div>

                  <button
                    type="button"
                    onClick={() => removeHighlight(item.id)}
                    style={dangerButtonStyle}
                  >
                    Delete
                  </button>
                </div>

                <Field label="Squares (comma separated)">
                  <input
                    value={Array.isArray(item.squares) ? item.squares.join(", ") : ""}
                    onChange={(e) =>
                      updateHighlight(item.id, {
                        squares: parseNumberList(e.target.value),
                      })
                    }
                    style={inputStyle}
                  />
                </Field>

                <Field label="Color">
                  <select
                    value={item.color ?? "primary"}
                    onChange={(e) =>
                      updateHighlight(item.id, {
                        color: e.target.value as HighlightSpec["color"],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="primary">primary</option>
                    <option value="success">success</option>
                    <option value="warning">warning</option>
                    <option value="danger">danger</option>
                    <option value="info">info</option>
                  </select>
                </Field>

                <div style={toggleGridStyle}>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.pulse}
                      onChange={(e) =>
                        updateHighlight(item.id, { pulse: e.target.checked })
                      }
                    />
                    Pulse
                  </label>

                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.fill}
                      onChange={(e) =>
                        updateHighlight(item.id, { fill: e.target.checked })
                      }
                    />
                    Fill
                  </label>

                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.outline}
                      onChange={(e) =>
                        updateHighlight(item.id, { outline: e.target.checked })
                      }
                    />
                    Outline
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

function parseNumberList(text: string): number[] {
  return text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 12,
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

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  color: "#111827",
};

const itemTitleStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 14,
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

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const toggleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
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
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
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