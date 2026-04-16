import type {
  AnalysisMove,
  AnalysisNode,
  MoveGlyph,
  SourceDocument,
} from "../types/analysisTypes";
import type { ArrowSpec, HighlightSpec, RouteSpec } from "../types/presentationTypes";

function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function findNodeById(
  document: SourceDocument,
  nodeId: string | null | undefined
): AnalysisNode | null {
  if (!nodeId) return null;
  return document.nodes.find((node) => node.id === nodeId) ?? null;
}

export function getChildren(
  document: SourceDocument,
  nodeId: string | null | undefined
): AnalysisNode[] {
  const node = findNodeById(document, nodeId);
  if (!node) return [];

  return (node.childrenIds ?? [])
    .map((childId) => findNodeById(document, childId))
    .filter((child): child is AnalysisNode => !!child);
}

export function movesEqual(a?: AnalysisMove, b?: AnalysisMove): boolean {
  if (!a || !b) return false;

  if (a.notation && b.notation) {
    return a.notation.trim() === b.notation.trim();
  }

  if (typeof a.from === "number" && typeof b.from === "number" && a.from !== b.from) {
    return false;
  }

  if (typeof a.to === "number" && typeof b.to === "number" && a.to !== b.to) {
    return false;
  }

  const pathA = a.path ?? [];
  const pathB = b.path ?? [];

  if (pathA.length !== pathB.length) return false;
  for (let i = 0; i < pathA.length; i += 1) {
    if (pathA[i] !== pathB[i]) return false;
  }

  return true;
}

export function findExistingChildForMove(
  document: SourceDocument,
  parentId: string,
  move: AnalysisMove
): AnalysisNode | null {
  const children = getChildren(document, parentId);
  return children.find((child) => movesEqual(child.move, move)) ?? null;
}

export function sortNodesInDocument(document: SourceDocument): SourceDocument {
  const next = cloneDocument(document);

  next.nodes = [...next.nodes].sort((a, b) => {
    if (a.plyIndex !== b.plyIndex) return a.plyIndex - b.plyIndex;
    if (a.isMainline !== b.isMainline) return a.isMainline === false ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  return next;
}

export function addMoveAtNode(
  document: SourceDocument,
  selectedNodeId: string,
  input: {
    move: AnalysisMove;
    fenAfter: string;
  }
): {
  document: SourceDocument;
  selectedNodeId: string;
  reusedExistingNode: boolean;
} {
  const baseDocument = cloneDocument(document);
  const parentNode = findNodeById(baseDocument, selectedNodeId);

  if (!parentNode) {
    return {
      document: baseDocument,
      selectedNodeId,
      reusedExistingNode: false,
    };
  }

  const existingChild = findExistingChildForMove(baseDocument, parentNode.id, input.move);
  if (existingChild) {
    return {
      document: baseDocument,
      selectedNodeId: existingChild.id,
      reusedExistingNode: true,
    };
  }

  const existingChildren = getChildren(baseDocument, parentNode.id);
  const hasMainlineChild = existingChildren.some((child) => child.isMainline !== false);

  const nextNode: AnalysisNode = {
    id: crypto.randomUUID(),
    parentId: parentNode.id,
    childrenIds: [],
    variationOf: hasMainlineChild ? parentNode.id : null,
    isMainline: !hasMainlineChild,
    plyIndex: parentNode.plyIndex + 1,
    move: input.move,
    fenAfter: input.fenAfter,
    glyphs: [],
    labels: [],
  };

  const updatedParent: AnalysisNode = {
    ...parentNode,
    childrenIds: [...parentNode.childrenIds, nextNode.id],
  };

  const nextNodes = baseDocument.nodes.map((node) =>
    node.id === parentNode.id ? updatedParent : node
  );

  nextNodes.push(nextNode);

  const nextDocument = sortNodesInDocument({
    ...baseDocument,
    nodes: nextNodes,
  });

  return {
    document: nextDocument,
    selectedNodeId: nextNode.id,
    reusedExistingNode: false,
  };
}

export function updateNodeTextField(
  document: SourceDocument,
  nodeId: string,
  field: "comment" | "preMoveComment",
  value: string
): SourceDocument {
  const next = cloneDocument(document);

  next.nodes = next.nodes.map((node) =>
    node.id !== nodeId
      ? node
      : {
          ...node,
          [field]: {
            values: {
              en: value,
              nl: value,
            },
          },
        }
  );

  return next;
}

export function moveNodeWithinSiblings(
  document: SourceDocument,
  nodeId: string,
  direction: "up" | "down"
): SourceDocument {
  const next = cloneDocument(document);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (!node?.parentId) return next;

  const parent = next.nodes.find((item) => item.id === node.parentId);
  if (!parent || !Array.isArray(parent.childrenIds) || parent.childrenIds.length < 2) {
    return next;
  }

  const siblings = [...parent.childrenIds];
  const index = siblings.indexOf(nodeId);
  if (index < 0) return next;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return next;

  const temp = siblings[index];
  siblings[index] = siblings[targetIndex];
  siblings[targetIndex] = temp;

  const mainlineId = siblings[0] ?? null;

  next.nodes = next.nodes.map((item) => {
    if (item.id === parent.id) {
      return {
        ...item,
        childrenIds: siblings,
      };
    }

    if (item.parentId !== parent.id) {
      return item;
    }

    if (item.id === mainlineId) {
      return {
        ...item,
        isMainline: true,
        variationOf: null,
      };
    }

    return {
      ...item,
      isMainline: false,
      variationOf: mainlineId,
    };
  });

  return next;
}

export function updateNodeGlyph(
  document: SourceDocument,
  nodeId: string,
  glyph: MoveGlyph | ""
): SourceDocument {
  const next = cloneDocument(document);
  next.nodes = next.nodes.map((node) =>
    node.id !== nodeId
      ? node
      : {
          ...node,
          glyphs: glyph ? [glyph] : [],
        }
  );
  return next;
}

export function updateNodeOverlays(
  document: SourceDocument,
  nodeId: string,
  patch: {
    highlights?: HighlightSpec[];
    arrows?: ArrowSpec[];
    routes?: RouteSpec[];
  }
): SourceDocument {
  const next = cloneDocument(document);
  next.nodes = next.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    return {
      ...node,
      ...(patch.highlights !== undefined ? { highlights: patch.highlights } : {}),
      ...(patch.arrows !== undefined ? { arrows: patch.arrows } : {}),
      ...(patch.routes !== undefined ? { routes: patch.routes } : {}),
    };
  });
  return next;
}

export function setRootFen(
  document: SourceDocument,
  fen: string
): SourceDocument {
  const next = cloneDocument(document);

  next.initialFen = fen;
  next.nodes = next.nodes.map((node) =>
    node.id === next.rootNodeId
      ? {
          ...node,
          fenAfter: fen,
        }
      : node
  );

  return next;
}