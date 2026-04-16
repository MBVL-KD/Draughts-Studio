import type { AnalysisMove, AnalysisNode, SourceDocument } from "../types/analysisTypes";

export function createChildNode(params: {
  parent: AnalysisNode;
  move: AnalysisMove;
  fenAfter: string;
  isMainline: boolean;
}): AnalysisNode {
  const { parent, move, fenAfter, isMainline } = params;

  return {
    id: crypto.randomUUID(),
    parentId: parent.id,
    childrenIds: [],
    variationOf: isMainline ? null : parent.id,
    isMainline,
    plyIndex: parent.plyIndex + 1,
    move,
    fenAfter,
    glyphs: [],
    labels: [],
    highlights: [],
    arrows: [],
    routes: [],
  };
}

export function appendChildToDocument(params: {
  document: SourceDocument;
  parentNodeId: string;
  childNode: AnalysisNode;
}): SourceDocument {
  const { document, parentNodeId, childNode } = params;

  return {
    ...document,
    nodes: document.nodes.flatMap((node) => {
      if (node.id === parentNodeId) {
        return [
          {
            ...node,
            childrenIds: [...node.childrenIds, childNode.id],
          },
          childNode,
        ];
      }
      return [node];
    }),
  };
}