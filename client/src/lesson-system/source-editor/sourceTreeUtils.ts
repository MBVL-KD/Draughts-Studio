import type { AnalysisMove, AnalysisNode, SourceDocument } from "../types/analysisTypes";

export function getNodeById(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode | null {
  if (!document || !nodeId) return null;
  return document.nodes.find((node) => node.id === nodeId) ?? null;
}

export function getRootNode(document: SourceDocument | null): AnalysisNode | null {
  if (!document) return null;
  return getNodeById(document, document.rootNodeId);
}

export function getChildren(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode[] {
  const node = getNodeById(document, nodeId);
  if (!document || !node) return [];
  return node.childrenIds
    .map((childId) => getNodeById(document, childId))
    .filter((child): child is AnalysisNode => !!child);
}

export function getParentNode(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode | null {
  const node = getNodeById(document, nodeId);
  if (!document || !node?.parentId) return null;
  return getNodeById(document, node.parentId);
}

export function getNodePathToRoot(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode[] {
  const path: AnalysisNode[] = [];
  let current = getNodeById(document, nodeId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? getNodeById(document, current.parentId) : null;
  }

  return path;
}

export function getFenForNode(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): string | null {
  if (!document || !nodeId) return null;
  const node = getNodeById(document, nodeId);
  if (!node) return null;
  return node.fenAfter;
}

export function getMainlineChild(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode | null {
  const children = getChildren(document, nodeId);
  return children.find((child) => child.isMainline) ?? children[0] ?? null;
}

export function getVariationChildren(
  document: SourceDocument | null,
  nodeId: string | null | undefined
): AnalysisNode[] {
  const children = getChildren(document, nodeId);
  const mainline = getMainlineChild(document, nodeId);
  return children.filter((child) => child.id !== mainline?.id);
}

export function getMainlineFromNode(
  document: SourceDocument | null,
  startNodeId: string | null | undefined
): AnalysisNode[] {
  const result: AnalysisNode[] = [];
  let current = getNodeById(document, startNodeId);

  while (current) {
    result.push(current);
    current = getMainlineChild(document, current.id);
  }

  return result;
}

function normalizeMoveKey(move?: AnalysisMove): string {
  if (!move) return "";
  if (move.path?.length) return `${move.side}:${move.path.join("-")}`;
  if (typeof move.from === "number" && typeof move.to === "number") {
    return `${move.side}:${move.from}-${move.to}`;
  }
  return `${move.side}:${move.notation}`;
}

export function findChildByMove(
  document: SourceDocument | null,
  parentNodeId: string,
  move: AnalysisMove
): AnalysisNode | null {
  const children = getChildren(document, parentNodeId);
  const targetKey = normalizeMoveKey(move);
  return children.find((child) => normalizeMoveKey(child.move) === targetKey) ?? null;
}