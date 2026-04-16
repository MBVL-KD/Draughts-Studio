import axios from "axios";

export type SolutionMovePayload = {
  id?: string;
  parentId?: string | null;
  variationOf?: string | null;

  from: number;
  path: number[];
  to: number;
  captures: number[];
  side: "W" | "B";
  notation: string;

  comment?: string;
  glyph?: string;
};

export type SolutionPayload = {
  initialFen: string;
  moves: SolutionMovePayload[];
};

export type CreatePuzzlePayload = {
  title: string;
  kind: string;
  fen: string;
  sideToMove: "W" | "B";
  prompt?: string;
  hint?: string;
  explanation?: string;
  solutionMoves?: string[];
  bestMove?: string;
  solution?: SolutionPayload;
  tags?: string[];
  difficulty?: number;
  source?: {
    book?: string;
    chapter?: string;
    motif?: string;
  };
  examEligible?: boolean;
  positionHash?: string;
};

export type PatchPuzzlePayload = Partial<CreatePuzzlePayload>;

const API_BASE = "http://localhost:4000/api";

export const createPuzzle = async (payload: CreatePuzzlePayload) => {
  const response = await axios.post(`${API_BASE}/puzzles`, payload);
  return response.data;
};

export const updatePuzzle = async (
  id: string,
  payload: CreatePuzzlePayload
) => {
  const response = await axios.put(`${API_BASE}/puzzles/${id}`, payload);
  return response.data;
};

export const patchPuzzle = async (
  id: string,
  payload: PatchPuzzlePayload
) => {
  const response = await axios.put(`${API_BASE}/puzzles/${id}`, payload);
  return response.data;
};

export const deletePuzzle = async (id: string) => {
  const response = await axios.delete(`${API_BASE}/puzzles/${id}`);
  return response.data;
};
