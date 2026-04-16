import type { SourceDocument, AnalysisNode } from "../types/analysisTypes";

// ─── Data model ───────────────────────────────────────────────────────────────

export type MoveEntry = {
  nodeId: string;
  notation: string;
  isSelected: boolean;
  glyphs: string[];
  primaryGlyph: string | null;
  engineEvalText: string | null;
  hasComment: boolean;
  hasPreMoveComment: boolean;
  hasEngine: boolean;
};

export type VariationBlock = {
  id: string;
  rows: MoveRow[];
};

/**
 * One "line" in the move text:
 *   1.  33-28   18-23
 *   white ↑     ↑ black
 *
 * Variations that branch after white's move → afterWhiteVariations
 * Variations that branch after black's move → afterBlackVariations
 *
 * white can be null when a variation starts on black's move (shows "1...")
 */
export type MoveRow = {
  id: string;
  moveNumber: number;
  white: MoveEntry | null;
  black: MoveEntry | null;
  afterWhiteVariations: VariationBlock[];
  afterBlackVariations: VariationBlock[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(node: AnalysisNode, selectedNodeId: string | null): MoveEntry {
  const evalValue =
    node.engine?.status === "ok" && typeof node.engine.evaluation === "number"
      ? node.engine.evaluation
      : null;

  return {
    nodeId: node.id,
    notation: compactCaptureNotation(node.move?.notation ?? `#${node.plyIndex}`),
    isSelected: node.id === selectedNodeId,
    glyphs: node.glyphs ?? [],
    primaryGlyph: node.glyphs?.[0] ?? null,
    engineEvalText: evalValue == null ? null : `${evalValue >= 0 ? "+" : ""}${evalValue.toFixed(2)}`,
    hasComment: !!(node.comment?.values?.en || node.comment?.values?.nl),
    hasPreMoveComment: !!(node.preMoveComment?.values?.en || node.preMoveComment?.values?.nl),
    hasEngine: !!node.engine,
  };
}

function compactCaptureNotation(notation: string): string {
  if (!notation.includes("x")) return notation;
  const squares = notation
    .split("x")
    .map((part) => part.trim())
    .filter(Boolean);
  if (squares.length < 2) return notation;
  return `${squares[0]}x${squares[squares.length - 1]}`;
}

function getSortedChildren(
  node: AnalysisNode,
  map: Map<string, AnalysisNode>
): AnalysisNode[] {
  return (node.childrenIds ?? [])
    .map((id) => map.get(id))
    .filter((n): n is AnalysisNode => !!n)
    .sort((a, b) => {
      // Mainline (isMainline !== false) sorts first
      const aMain = a.isMainline !== false ? 0 : 1;
      const bMain = b.isMainline !== false ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      return a.plyIndex - b.plyIndex;
    });
}

// ─── Core builders ────────────────────────────────────────────────────────────

/**
 * Build rows from parentNode's children onward.
 * parentNode's first child = white's move, its first child = black's move, etc.
 */
function buildMainlineRows(
  parentNode: AnalysisNode,
  map: Map<string, AnalysisNode>,
  selectedNodeId: string | null
): MoveRow[] {
  const rows: MoveRow[] = [];
  let currentParent: AnalysisNode = parentNode;

  while (true) {
    const children = getSortedChildren(currentParent, map);
    if (children.length === 0) break;

    // First child = mainline white move; rest = white alternatives
    const whiteNode = children[0];
    const afterWhiteVariations: VariationBlock[] = children.slice(1).map((alt) => ({
      id: alt.id,
      rows: buildVariationRows(alt, map, selectedNodeId),
    }));

    const white = makeEntry(whiteNode, selectedNodeId);

    // White's children: first = mainline black move; rest = black alternatives
    const whiteChildren = getSortedChildren(whiteNode, map);
    const blackNode = whiteChildren[0] ?? null;
    const afterBlackVariations: VariationBlock[] = whiteChildren.slice(1).map((alt) => ({
      id: alt.id,
      rows: buildVariationRows(alt, map, selectedNodeId),
    }));

    rows.push({
      id: whiteNode.id,
      moveNumber: Math.ceil(whiteNode.plyIndex / 2),
      white,
      black: blackNode ? makeEntry(blackNode, selectedNodeId) : null,
      afterWhiteVariations,
      afterBlackVariations,
    });

    if (!blackNode) break;

    // Advance: blackNode's children = next white move + its variations
    currentParent = blackNode;
  }

  return rows;
}

/**
 * Build rows for a variation that starts at startNode.
 * startNode can be either a white move (odd plyIndex) or a black move (even).
 */
function buildVariationRows(
  startNode: AnalysisNode,
  map: Map<string, AnalysisNode>,
  selectedNodeId: string | null
): MoveRow[] {
  if (startNode.plyIndex % 2 === 1) {
    // Variation starts with white's move
    const white = makeEntry(startNode, selectedNodeId);
    const children = getSortedChildren(startNode, map);
    const blackNode = children[0] ?? null;
    const afterBlackVariations: VariationBlock[] = children.slice(1).map((alt) => ({
      id: alt.id,
      rows: buildVariationRows(alt, map, selectedNodeId),
    }));

    const firstRow: MoveRow = {
      id: startNode.id,
      moveNumber: Math.ceil(startNode.plyIndex / 2),
      white,
      black: blackNode ? makeEntry(blackNode, selectedNodeId) : null,
      afterWhiteVariations: [],
      afterBlackVariations,
    };

    if (!blackNode) return [firstRow];
    return [firstRow, ...buildMainlineRows(blackNode, map, selectedNodeId)];
  } else {
    // Variation starts with black's move — show as "N... blackMove"
    const black = makeEntry(startNode, selectedNodeId);
    const halfRow: MoveRow = {
      id: startNode.id,
      moveNumber: Math.ceil(startNode.plyIndex / 2),
      white: null,
      black,
      afterWhiteVariations: [],
      afterBlackVariations: [],
    };
    return [halfRow, ...buildMainlineRows(startNode, map, selectedNodeId)];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildMoveRows(
  document: SourceDocument,
  selectedNodeId: string | null
): MoveRow[] {
  const map = new Map(document.nodes.map((n) => [n.id, n]));
  const root = map.get(document.rootNodeId);
  if (!root) return [];
  return buildMainlineRows(root, map, selectedNodeId);
}

// Keep old export for backwards compatibility with anything still importing it
export type { MoveRow as MoveTextLine };