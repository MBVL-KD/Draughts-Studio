import type { CSSProperties } from "react";
import type { AnimationCue } from "../../types/presentationTypes";

type Props = {
  animations: AnimationCue[];
  onChange: (next: AnimationCue[]) => void;
};

export default function AnimationCueEditor({ animations, onChange }: Props) {
  const addCue = () => {
    const next: AnimationCue = {
      id: crypto.randomUUID(),
      atMs: 0,
      action: "showArrow",
      targetId: "",
    };

    onChange([...animations, next]);
  };

  const updateCue = (id: string, patch: Partial<AnimationCue>) => {
    onChange(animations.map((cue) => (cue.id === id ? { ...cue, ...patch } : cue)));
  };

  const removeCue = (id: string) => {
    onChange(animations.filter((cue) => cue.id !== id));
  };

  return (
    <div style={sectionStyle}>
      <div style={headerRowStyle}>
        <strong style={sectionTitleStyle}>Cue list</strong>
        <button onClick={addCue} style={secondaryButtonStyle}>
          + Cue
        </button>
      </div>

      {animations.length === 0 ? (
        <EmptyState text="Nog geen animation cues." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {animations.map((cue, index) => (
            <div key={cue.id} style={cardStyle}>
              <div style={headerRowStyle}>
                <div style={itemTitleStyle}>Cue {index + 1}</div>
                <button onClick={() => removeCue(cue.id)} style={dangerButtonStyle}>
                  Verwijder
                </button>
              </div>

              <div style={twoColStyle}>
                <Field label="At ms">
                  <input
                    type="number"
                    value={cue.atMs}
                    onChange={(e) =>
                      updateCue(cue.id, { atMs: Number(e.target.value || 0) })
                    }
                    style={inputStyle}
                  />
                </Field>

                <Field label="Action">
                  <select
                    value={cue.action}
                    onChange={(e) =>
                      updateCue(cue.id, {
                        action: e.target.value as AnimationCue["action"],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="showArrow">showArrow</option>
                    <option value="hideArrow">hideArrow</option>
                    <option value="showHighlight">showHighlight</option>
                    <option value="hideHighlight">hideHighlight</option>
                    <option value="playMove">playMove</option>
                  </select>
                </Field>
              </div>

              <Field label="Target id">
                <input
                  value={cue.targetId ?? ""}
                  onChange={(e) => updateCue(cue.id, { targetId: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </div>
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

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
};

const itemTitleStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 14,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
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