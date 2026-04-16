import { useEffect, useState } from "react";
import axios from "axios";
import {
  createPuzzle,
  updatePuzzle,
  type SolutionPayload,
} from "./puzzleApi";

export type PuzzleFormData = {
  id?: string;
  title: string;
  kind: string;
  prompt: string;
  hint: string;
  explanation: string;
  solutionMovesText: string;
  tagsText: string;
  difficulty: number;
  book: string;
  chapter: string;
  motif: string;
  examEligible: boolean;
};

type Props = {
  fen: string;
  sideToMove: "W" | "B";
  initialData?: PuzzleFormData;
  externalSolutionText?: string;
  externalStructuredSolution?: SolutionPayload | undefined;
};

const createDefaultFormData = (): PuzzleFormData => ({
  title: "",
  kind: "find_combination",
  prompt: "",
  hint: "",
  explanation: "",
  solutionMovesText: "",
  tagsText: "",
  difficulty: 1,
  book: "",
  chapter: "",
  motif: "",
  examEligible: false,
});

export default function PuzzleForm({
  fen,
  sideToMove,
  initialData,
  externalSolutionText,
  externalStructuredSolution,
}: Props) {
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("find_combination");
  const [prompt, setPrompt] = useState("");
  const [hint, setHint] = useState("");
  const [explanation, setExplanation] = useState("");
  const [solutionMovesText, setSolutionMovesText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [difficulty, setDifficulty] = useState(1);
  const [book, setBook] = useState("");
  const [chapter, setChapter] = useState("");
  const [motif, setMotif] = useState("");
  const [examEligible, setExamEligible] = useState(false);
  const [structuredSolution, setStructuredSolution] = useState<
    SolutionPayload | undefined
  >(undefined);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const data = initialData ?? createDefaultFormData();

    setEditingId(data.id);
    setTitle(data.title);
    setKind(data.kind);
    setPrompt(data.prompt);
    setHint(data.hint);
    setExplanation(data.explanation);
    setSolutionMovesText(data.solutionMovesText);
    setTagsText(data.tagsText);
    setDifficulty(data.difficulty);
    setBook(data.book);
    setChapter(data.chapter);
    setMotif(data.motif);
    setExamEligible(data.examEligible);
    setStructuredSolution(undefined);
    setStatus("");
  }, [initialData]);

  useEffect(() => {
    if (externalSolutionText) {
      setSolutionMovesText(externalSolutionText);
    }
  }, [externalSolutionText]);

  useEffect(() => {
    if (externalStructuredSolution) {
      console.log("PuzzleForm received externalStructuredSolution:", externalStructuredSolution);
      setStructuredSolution(externalStructuredSolution);
    }
  }, [externalStructuredSolution]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setStatus("Save failed ❌ Title is required");
      return;
    }

    try {
      setStatus("Saving...");

      const solutionMoves = solutionMovesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const tags = tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        title: trimmedTitle,
        kind,
        fen,
        sideToMove,
        prompt,
        hint,
        explanation,
        solutionMoves,
        tags,
        difficulty,
        source: {
          book,
          chapter,
          motif,
        },
        examEligible,
        positionHash: fen,
        ...(structuredSolution && structuredSolution.moves.length > 0
          ? { solution: structuredSolution }
          : {}),
      };

      console.log("PuzzleForm SAVE payload:", payload);

      if (editingId) {
        await updatePuzzle(editingId, payload);
        setStatus("Updated ✅");
      } else {
        const created = await createPuzzle(payload);
        setEditingId(created._id);
        setStatus("Saved ✅");
      }
    } catch (error) {
      console.error("Save puzzle error:", error);

      if (axios.isAxiosError(error)) {
        const serverMessage =
          error.response?.data?.details ||
          error.response?.data?.error ||
          error.message;

        setStatus(`Save failed ❌ ${serverMessage}`);
      } else {
        setStatus("Save failed ❌");
      }
    }
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
      <h3>Puzzle Details</h3>

      {editingId && (
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>Editing existing puzzle</strong>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="find_combination">Find Combination</option>
          <option value="best_move">Best Move</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="replay_sequence">Replay Sequence</option>
          <option value="setup_position">Setup Position</option>
          <option value="explanation">Explanation</option>
        </select>

        <textarea
          placeholder="Prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />

        <textarea
          placeholder="Hint"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          rows={2}
        />

        <textarea
          placeholder="Explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
        />

        <input
          placeholder="Solution moves, comma separated"
          value={solutionMovesText}
          onChange={(e) => setSolutionMovesText(e.target.value)}
        />

        <input
          placeholder="Tags, comma separated"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />

        <input
          placeholder="Book"
          value={book}
          onChange={(e) => setBook(e.target.value)}
        />

        <input
          placeholder="Chapter"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
        />

        <input
          placeholder="Motif"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />

        <label>
          Difficulty: {difficulty}
          <input
            type="range"
            min={1}
            max={5}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={examEligible}
            onChange={(e) => setExamEligible(e.target.checked)}
          />
          Exam eligible
        </label>

        <div>
          <strong>FEN</strong>
          <div
            style={{
              marginTop: 6,
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 12,
              wordBreak: "break-word",
            }}
          >
            {fen}
          </div>
        </div>

        <div>
          <strong>Side to move:</strong> {sideToMove}
        </div>

        <button onClick={handleSave} style={{ padding: "10px 12px" }}>
          {editingId ? "Update Puzzle" : "Save Puzzle"}
        </button>

        <div>{status}</div>
      </div>
    </div>
  );
}