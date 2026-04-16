import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardState, PieceCode } from "../board/boardTypes";
import { fenToBoardState } from "../board/fenUtils";
import {
  patchPuzzle,
  type SolutionPayload,
  type SolutionMovePayload,
} from "../puzzles/puzzleApi";

type Props = {
  puzzleId?: string;
  solution?: SolutionPayload;
  onJumpToBoard: (board: BoardState) => void;
  onSolutionChange: (solution: SolutionPayload) => void;
  onPositionContextChange: (payload: {
    parentMoveId: string | null;
    boardAtPosition: BoardState;
    sideToMove: "W" | "B";
    isReplayPositionActive: boolean;
  }) => void;
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
  fontWeight: 700,
  color: "#111",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const glyphButtonBase: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  minWidth: 40,
  color: "#111",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.1,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #cfcfcf",
  background: "#fff",
  cursor: "pointer",
  color: "#111",
  fontSize: 14,
  fontWeight: 600,
};

const glyphOptions = ["", "!", "?", "!!", "??", "!?", "?!"];

const cloneBoard = (board: BoardState): BoardState => ({
  sideToMove: board.sideToMove,
  squares: { ...board.squares },
});

const isMan = (piece: PieceCode) => piece === "wm" || piece === "bm";

const squareToCoord = (square: number) => {
  const row = Math.floor((square - 1) / 5);
  const posInRow = (square - 1) % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
};

const shouldPromote = (square: number, piece: PieceCode): boolean => {
  if (!isMan(piece)) return false;
  const { row } = squareToCoord(square);
  if (piece === "wm" && row === 0) return true;
  if (piece === "bm" && row === 9) return true;
  return false;
};

const promotePiece = (piece: PieceCode): PieceCode => {
  if (piece === "wm") return "wk";
  if (piece === "bm") return "bk";
  return piece;
};

function applyRecordedMove(
  board: BoardState,
  move: SolutionMovePayload
): BoardState {
  const newBoard = cloneBoard(board);

  const piece = newBoard.squares[move.from];
  newBoard.squares[move.from] = "empty";

  for (const cap of move.captures) {
    newBoard.squares[cap] = "empty";
  }

  const finalPiece = shouldPromote(move.to, piece) ? promotePiece(piece) : piece;
  newBoard.squares[move.to] = finalPiece;
  newBoard.sideToMove = newBoard.sideToMove === "W" ? "B" : "W";

  return newBoard;
}

function getShortDisplayNotation(move: SolutionMovePayload): string {
  if (move.path && move.path.length >= 2) {
    const isCapture = !!move.captures?.length;
    return move.path.join(isCapture ? "x" : "-");
  }

  const isCapture = !!move.captures?.length;
  return isCapture ? `${move.from}x${move.to}` : `${move.from}-${move.to}`;
}

function normalizeMoves(solution?: SolutionPayload): SolutionMovePayload[] {
  if (!solution?.moves) return [];

  const hasTreeFields = solution.moves.some((m) => m.id || m.parentId || m.variationOf);
  if (hasTreeFields) {
    return solution.moves.map((m, index) => ({
      ...m,
      id: m.id || `main_${index}`,
      parentId:
        m.parentId !== undefined
          ? m.parentId
          : index === 0
          ? null
          : solution.moves[index - 1].id || `main_${index - 1}`,
      variationOf: m.variationOf ?? null,
    }));
  }

  return solution.moves.map((m, index) => ({
    ...m,
    id: `main_${index}`,
    parentId: index === 0 ? null : `main_${index - 1}`,
    variationOf: null,
  }));
}

function buildMainline(allMoves: SolutionMovePayload[]): SolutionMovePayload[] {
  const roots = allMoves.filter((m) => (m.parentId ?? null) === null);
  const root = roots.find((m) => !m.variationOf) ?? roots[0];
  if (!root) return [];

  const result: SolutionMovePayload[] = [root];
  let currentId = root.id ?? null;

  while (true) {
    const children = allMoves.filter((m) => (m.parentId ?? null) === currentId);
    const next = children.find((m) => !m.variationOf) ?? null;
    if (!next) break;
    result.push(next);
    currentId = next.id ?? null;
  }

  return result;
}

type MoveRow = {
  moveNumber: number;
  white?: { index: number; move: SolutionMovePayload };
  black?: { index: number; move: SolutionMovePayload };
};

function buildMoveRows(
  moves: SolutionMovePayload[],
  initialSide: "W" | "B"
): MoveRow[] {
  const rows: MoveRow[] = [];

  if (initialSide === "W") {
    let moveNumber = 1;
    for (let i = 0; i < moves.length; i += 2) {
      rows.push({
        moveNumber,
        white: moves[i] ? { index: i, move: moves[i] } : undefined,
        black: moves[i + 1] ? { index: i + 1, move: moves[i + 1] } : undefined,
      });
      moveNumber += 1;
    }
    return rows;
  }

  if (moves[0]) {
    rows.push({
      moveNumber: 1,
      black: { index: 0, move: moves[0] },
    });
  }

  let moveNumber = 2;
  for (let i = 1; i < moves.length; i += 2) {
    rows.push({
      moveNumber,
      white: moves[i] ? { index: i, move: moves[i] } : undefined,
      black: moves[i + 1] ? { index: i + 1, move: moves[i + 1] } : undefined,
    });
    moveNumber += 1;
  }

  return rows;
}

export default function ReplayPanel({
  puzzleId,
  solution,
  onJumpToBoard,
  onSolutionChange,
  onPositionContextChange,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingMoveIndex, setEditingMoveIndex] = useState<number | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [draftGlyph, setDraftGlyph] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const autosaveTimer = useRef<number | null>(null);

  const normalizedMoves = useMemo(() => normalizeMoves(solution), [solution]);
  const mainlineMoves = useMemo(() => buildMainline(normalizedMoves), [normalizedMoves]);

  const states = useMemo(() => {
    if (!solution?.initialFen || !mainlineMoves.length) {
      return [];
    }

    const base = fenToBoardState(solution.initialFen);
    const built: BoardState[] = [cloneBoard(base)];

    let current = cloneBoard(base);
    for (const move of mainlineMoves) {
      current = applyRecordedMove(current, move);
      built.push(cloneBoard(current));
    }

    return built;
  }, [solution, mainlineMoves]);

  const initialSide = useMemo<"W" | "B">(() => {
    if (!solution?.initialFen) return "W";
    return solution.initialFen.startsWith("B:") ? "B" : "W";
  }, [solution]);

  const moveRows = useMemo(
    () => buildMoveRows(mainlineMoves, initialSide),
    [mainlineMoves, initialSide]
  );

  useEffect(() => {
    setCurrentIndex(0);
  }, [solution]);

  useEffect(() => {
    if (states.length > 0) {
      onJumpToBoard(states[currentIndex]);

      const parentMoveId =
        currentIndex > 0 && currentIndex - 1 < mainlineMoves.length
          ? mainlineMoves[currentIndex - 1].id ?? null
          : null;

      onPositionContextChange({
        parentMoveId,
        boardAtPosition: states[currentIndex],
        sideToMove: states[currentIndex].sideToMove,
        isReplayPositionActive: currentIndex > 0,
      });
    }
  }, [states, currentIndex, mainlineMoves, onJumpToBoard, onPositionContextChange]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
    };
  }, []);

  const maxIndex = Math.max(0, states.length - 1);
  const canReplay = states.length > 0 && mainlineMoves.length > 0;
  const selectedMove =
    currentIndex > 0 && currentIndex - 1 < mainlineMoves.length
      ? mainlineMoves[currentIndex - 1]
      : null;

  const openAnnotationEditor = (
    e: React.MouseEvent,
    move: SolutionMovePayload,
    index: number
  ) => {
    e.preventDefault();
    setEditingMoveIndex(index);
    setDraftComment(move.comment ?? "");
    setDraftGlyph(move.glyph ?? "");
  };

  const autosaveSolution = async (nextSolution: SolutionPayload) => {
    onSolutionChange(nextSolution);

    if (!puzzleId) return;

    try {
      setSaveStatus("Saving...");
      await patchPuzzle(puzzleId, {
        solution: nextSolution,
        solutionMoves: buildMainline(normalizeMoves(nextSolution)).map((m) => m.notation),
      });
      setSaveStatus("Saved ✓");
      window.setTimeout(() => setSaveStatus(""), 1200);
    } catch (error) {
      console.error(error);
      setSaveStatus("Save failed");
    }
  };

  const saveAnnotation = () => {
    if (!solution || editingMoveIndex === null) return;

    const targetId = mainlineMoves[editingMoveIndex]?.id;
    if (!targetId) return;

    const nextMoves = normalizeMoves(solution).map((move) =>
      move.id === targetId
        ? {
            ...move,
            comment: draftComment,
            glyph: draftGlyph,
          }
        : move
    );

    const nextSolution = {
      ...solution,
      moves: nextMoves,
    };

    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = window.setTimeout(() => {
      autosaveSolution(nextSolution);
    }, 500);

    onSolutionChange(nextSolution);

    setEditingMoveIndex(null);
    setDraftComment("");
    setDraftGlyph("");
  };

  return (
    <div
      style={{
        border: "1px solid #ddd",
        padding: 12,
        borderRadius: 14,
        background: "#f4f8ff",
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
        <h3 style={{ margin: 0, color: "#222" }}>Replay</h3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {saveStatus && <span style={{ fontSize: 12, color: "#555" }}>{saveStatus}</span>}

          <button
            type="button"
            title="Start"
            onClick={() => setCurrentIndex(0)}
            style={iconButtonStyle}
            disabled={!canReplay}
          >
            ⏮
          </button>
          <button
            type="button"
            title="Previous"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            style={iconButtonStyle}
            disabled={!canReplay}
          >
            ◀
          </button>
          <button
            type="button"
            title="Next"
            onClick={() => setCurrentIndex((prev) => Math.min(maxIndex, prev + 1))}
            style={iconButtonStyle}
            disabled={!canReplay}
          >
            ▶
          </button>
          <button
            type="button"
            title="End"
            onClick={() => setCurrentIndex(maxIndex)}
            style={iconButtonStyle}
            disabled={!canReplay}
          >
            ⏭
          </button>
        </div>
      </div>

      {!solution && (
        <div style={{ color: "#666", fontSize: 14 }}>
          No structured solution loaded for this puzzle yet.
        </div>
      )}

      {solution && !mainlineMoves.length && (
        <div style={{ color: "#666", fontSize: 14 }}>
          This puzzle has no main line yet.
        </div>
      )}

      {canReplay && (
        <>
          <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
            Position: {currentIndex}/{mainlineMoves.length}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {moveRows.map((row) => (
              <div
                key={`row-${row.moveNumber}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 1fr",
                  gap: 8,
                  alignItems: "start",
                }}
              >
                <div style={{ fontWeight: 700, color: "#333", paddingTop: 6 }}>
                  {row.moveNumber}.
                </div>

                <div>
                  {row.white ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(row.white!.index + 1)}
                      onContextMenu={(e) =>
                        openAnnotationEditor(e, row.white!.move, row.white!.index)
                      }
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        borderRadius: 8,
                        border:
                          currentIndex === row.white.index + 1
                            ? "2px solid #2b7fff"
                            : "1px solid #ddd",
                        background:
                          currentIndex === row.white.index + 1 ? "#2b7fff" : "#fff",
                        color:
                          currentIndex === row.white.index + 1 ? "#fff" : "#111",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {getShortDisplayNotation(row.white.move)}
                      {row.white.move.glyph ? ` ${row.white.move.glyph}` : ""}
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

                <div>
                  {row.black ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(row.black!.index + 1)}
                      onContextMenu={(e) =>
                        openAnnotationEditor(e, row.black!.move, row.black!.index)
                      }
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        borderRadius: 8,
                        border:
                          currentIndex === row.black.index + 1
                            ? "2px solid #2b7fff"
                            : "1px solid #ddd",
                        background:
                          currentIndex === row.black.index + 1 ? "#2b7fff" : "#fff",
                        color:
                          currentIndex === row.black.index + 1 ? "#fff" : "#111",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {initialSide === "B" && row.moveNumber === 1 && !row.white
                        ? `... ${getShortDisplayNotation(row.black.move)}`
                        : `${getShortDisplayNotation(row.black.move)}`}
                      {row.black.move.glyph ? ` ${row.black.move.glyph}` : ""}
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedMove && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d7d7d7",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: "#222" }}>
                Selected ply: {currentIndex} — {selectedMove.notation}
                {selectedMove.glyph ? ` ${selectedMove.glyph}` : ""}
              </div>

              <div style={{ fontSize: 14, color: "#444", marginBottom: 6 }}>
                <strong>Shown in list:</strong> {getShortDisplayNotation(selectedMove)}
              </div>

              <div style={{ fontSize: 14, color: "#444", marginBottom: 6 }}>
                <strong>Glyph:</strong> {selectedMove.glyph || "—"}
              </div>

              <div style={{ fontSize: 14, color: "#444" }}>
                <strong>Comment:</strong>{" "}
                {selectedMove.comment && selectedMove.comment.trim().length > 0
                  ? selectedMove.comment
                  : "No comment"}
              </div>
            </div>
          )}

          {editingMoveIndex !== null && mainlineMoves[editingMoveIndex] && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d7d7d7",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#222" }}>
                Annotate ply {editingMoveIndex + 1}: {mainlineMoves[editingMoveIndex].notation}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {glyphOptions.map((glyph) => (
                  <button
                    key={glyph || "none"}
                    type="button"
                    onClick={() => setDraftGlyph(glyph)}
                    style={{
                      ...glyphButtonBase,
                      border:
                        draftGlyph === glyph ? "2px solid #2b7fff" : "1px solid #ddd",
                      background: draftGlyph === glyph ? "#eef5ff" : "#fff",
                    }}
                  >
                    {glyph || "—"}
                  </button>
                ))}
              </div>

              <textarea
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                placeholder="Comment for this move..."
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  padding: 8,
                  resize: "vertical",
                  marginBottom: 10,
                  color: "#111",
                  background: "#fff",
                }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={saveAnnotation} style={actionButtonStyle}>
                  Save annotation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMoveIndex(null);
                    setDraftComment("");
                    setDraftGlyph("");
                  }}
                  style={actionButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}