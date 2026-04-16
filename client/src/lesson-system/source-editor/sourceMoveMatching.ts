import type { AnalysisMove, AnalysisNode, SourceDocument } from "../types/analysisTypes";

function sameMove(a?: AnalysisMove, b?: AnalysisMove) {
  if (!a || !b) return false;

  if (a.notation && b.notation) {
    return a.notation === b.notation;
  }

  if (a.from !== undefined && b.from !== undefined && a.to !== undefined && b.to !== undefined) {
    return a.from === b.from && a.to === b.to;
  }

  return false;
}

export function findExistingChildByMove(
  document: SourceDocument,
  parentNode: AnalysisNode,
  move: AnalysisMove
): AnalysisNode | null {
  const nodeMap = new Map(document.nodes.map((node) => [node.id, node]));

  for (const childId of parentNode.childrenIds) {
    const child = nodeMap.get(childId);
    if (!child) continue;
    if (sameMove(child.move, move)) return child;
  }

  return null;
}