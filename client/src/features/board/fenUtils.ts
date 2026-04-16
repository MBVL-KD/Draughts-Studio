import type { BoardState, PieceCode, SideToMove } from "./boardTypes";
import { createEmptyBoardState } from "./boardTypes";

export const boardStateToFen = (board: BoardState): string => {
  const whiteMen: number[] = [];
  const whiteKings: number[] = [];
  const blackMen: number[] = [];
  const blackKings: number[] = [];

  for (let square = 1; square <= 50; square += 1) {
    const piece = board.squares[square];

    if (piece === "wm") whiteMen.push(square);
    if (piece === "wk") whiteKings.push(square);
    if (piece === "bm") blackMen.push(square);
    if (piece === "bk") blackKings.push(square);
  }

  const whiteParts = [
    ...whiteMen.map(String),
    ...whiteKings.map((sq) => `K${sq}`),
  ];

  const blackParts = [
    ...blackMen.map(String),
    ...blackKings.map((sq) => `K${sq}`),
  ];

  const whiteSection = `W${whiteParts.join(",")}`;
  const blackSection = `B${blackParts.join(",")}`;

  return `${board.sideToMove}:${whiteSection}:${blackSection}`;
};

const parsePieceList = (
  input: string,
  manCode: PieceCode,
  kingCode: PieceCode,
  squares: Record<number, PieceCode>
) => {
  if (!input) return;

  const content = input.slice(1).trim();
  if (!content) return;

  const parts = content
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.startsWith("K")) {
      const square = Number(part.slice(1));
      if (square >= 1 && square <= 50) {
        squares[square] = kingCode;
      }
    } else {
      const square = Number(part);
      if (square >= 1 && square <= 50) {
        squares[square] = manCode;
      }
    }
  }
};

export const fenToBoardState = (fen: string): BoardState => {
  const trimmed = fen.trim();
  const sections = trimmed.split(":");

  if (sections.length < 3) {
    throw new Error("Invalid FEN: expected format like W:W31,32:B1,2");
  }

  const sideToMove = sections[0].trim() as SideToMove;
  if (sideToMove !== "W" && sideToMove !== "B") {
    throw new Error("Invalid FEN: side to move must be W or B");
  }

  const board = createEmptyBoardState();
  board.sideToMove = sideToMove;

  const whiteSection = sections[1].trim();
  const blackSection = sections[2].trim();

  if (!whiteSection.startsWith("W")) {
    throw new Error("Invalid FEN: white section must start with W");
  }

  if (!blackSection.startsWith("B")) {
    throw new Error("Invalid FEN: black section must start with B");
  }

  parsePieceList(whiteSection, "wm", "wk", board.squares);
  parsePieceList(blackSection, "bm", "bk", board.squares);

  return board;
};