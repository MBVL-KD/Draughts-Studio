import type { RecordedMove } from "./useSolutionRecorder";

type Props = {
  isRecording: boolean;
  moves: RecordedMove[];
  chainInProgress: boolean;
  selectedFrom: number | null;
  onStart: () => void;
  onStop: () => void;
  onUndo: () => void;
  onClear: () => void;
  onApply: () => void;
  onResetToStart: () => void;
};

const iconButtonStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid #cfcfcf",
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 17,
  color: "#111",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

export default function SolutionRecorderPanel({
  isRecording,
  moves,
  chainInProgress,
  selectedFrom,
  onStart,
  onStop,
  onUndo,
  onClear,
  onApply,
  onResetToStart,
}: Props) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        padding: 12,
        borderRadius: 14,
        background: "#f6fff6",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0 }}>Solution Recorder</h3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isRecording ? (
            <button type="button" title="Start Recording" onClick={onStart} style={iconButtonStyle}>
              ⏺
            </button>
          ) : (
            <button type="button" title="Stop Recording" onClick={onStop} style={iconButtonStyle}>
              ⏹
            </button>
          )}

          <button type="button" title="Undo" onClick={onUndo} style={iconButtonStyle}>
            ↶
          </button>
          <button type="button" title="Clear Recording" onClick={onClear} style={iconButtonStyle}>
            🗑
          </button>
          <button
            type="button"
            title="Reset To Start"
            onClick={onResetToStart}
            style={iconButtonStyle}
          >
            ⟲
          </button>
          <button type="button" title="Apply To Form" onClick={onApply} style={iconButtonStyle}>
            ⇩
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        {isRecording ? (
          chainInProgress ? (
            <strong>Capture chain in progress from square {selectedFrom}</strong>
          ) : selectedFrom !== null ? (
            <strong>Selected from: {selectedFrom}</strong>
          ) : (
            <span>Click a piece to start recording</span>
          )
        ) : (
          <span>Recorder idle</span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          minHeight: 28,
        }}
      >
        {moves.length === 0 ? (
          <span style={{ color: "#666" }}>No recorded moves yet.</span>
        ) : (
          moves.map((m, i) => (
            <span
              key={i}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                background: "#fff",
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            >
              {i + 1}. {m.notation}
            </span>
          ))
        )}
      </div>
    </div>
  );
}