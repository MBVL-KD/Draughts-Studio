import type { CSSProperties } from "react";
import type { RouteSpec } from "../../types/presentationTypes";

type Props = {
  routes?: RouteSpec[] | null;
  activeRouteId?: string | null;
  onChange: (next: RouteSpec[]) => void;
  onSetActiveRouteId: (id: string | null) => void;
  onClearActiveRoute: () => void;
};

export default function RouteEditor({
  routes,
  activeRouteId,
  onChange,
  onSetActiveRouteId,
  onClearActiveRoute,
}: Props) {
  const safeRoutes = Array.isArray(routes) ? routes : [];

  const addRoute = () => {
    const next: RouteSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "info",
      closed: false,
      dashed: false,
      label: "",
    };

    const updated = [...safeRoutes, next];
    onChange(updated);
    onSetActiveRouteId(next.id);
  };

  const updateRoute = (id: string, patch: Partial<RouteSpec>) => {
    onChange(
      safeRoutes.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeRoute = (id: string) => {
    const updated = safeRoutes.filter((item) => item.id !== id);
    onChange(updated);

    if (activeRouteId === id) {
      onSetActiveRouteId(updated[0]?.id ?? null);
    }
  };

  return (
    <div style={sectionStyle}>
      <div style={headerRowStyle}>
        <strong style={sectionTitleStyle}>Routes</strong>
        <button type="button" onClick={addRoute} style={buttonStyle}>
          + Route
        </button>
      </div>

      <button type="button" onClick={onClearActiveRoute} style={secondaryButtonStyle}>
        Clear active route
      </button>

      {safeRoutes.length === 0 ? (
        <div style={emptyStyle}>
          No routes yet. Click + Route or click multiple squares directly on the
          board in Route mode.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {safeRoutes.map((item, index) => {
            const isActive = item.id === activeRouteId;

            return (
              <div
                key={item.id}
                style={{ ...cardStyle, ...(isActive ? activeCardStyle : null) }}
              >
                <div style={headerRowStyle}>
                  <button
                    type="button"
                    onClick={() => onSetActiveRouteId(item.id)}
                    style={pickButtonStyle(isActive)}
                  >
                    {isActive ? "Active" : "Set active"}
                  </button>

                  <strong style={itemTitleStyle}>Route {index + 1}</strong>

                  <button
                    type="button"
                    onClick={() => removeRoute(item.id)}
                    style={dangerButtonStyle}
                  >
                    Delete
                  </button>
                </div>

                <label style={fieldStyle}>
                  Squares
                  <input
                    style={inputStyle}
                    value={Array.isArray(item.squares) ? item.squares.join(", ") : ""}
                    onChange={(e) =>
                      updateRoute(item.id, {
                        squares: parseNumberList(e.target.value),
                      })
                    }
                  />
                </label>

                <label style={fieldStyle}>
                  Color
                  <select
                    style={inputStyle}
                    value={item.color ?? "info"}
                    onChange={(e) =>
                      updateRoute(item.id, {
                        color: e.target.value as RouteSpec["color"],
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
                      updateRoute(item.id, {
                        label: e.target.value,
                      })
                    }
                  />
                </label>

                <div style={toggleRowStyle}>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.closed}
                      onChange={(e) =>
                        updateRoute(item.id, {
                          closed: e.target.checked,
                        })
                      }
                    />
                    Closed
                  </label>

                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!item.dashed}
                      onChange={(e) =>
                        updateRoute(item.id, {
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

function parseNumberList(text: string): number[] {
  return text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
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