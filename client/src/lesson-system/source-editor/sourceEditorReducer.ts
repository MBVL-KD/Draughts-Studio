import { findExistingChildByMove } from "./sourceMoveMatching";
import { appendChildToDocument, createChildNode } from "./sourceNodeCreation";
import { fenToBoardState } from "../../features/board/fenUtils";
import {
  applyCompleteCaptureMove,
  applyEngineMove,
  applyPartialCaptureStep,
  cloneBoard,
  getAllCaptureSequencesForSquare,
  getContinuationCaptureTargets,
  getMaxCaptureCount,
  getTargetsForSquare,
} from "./sourceBoardEngine";

import type {
  AnalysisMove,
  EngineAnalysisSnapshot,
  MoveGlyph,
  SourceMetadata,
  SourceDocument,
} from "../types/analysisTypes";
import type { ArrowSpec, HighlightSpec, RouteSpec } from "../types/presentationTypes";
import {
  movesEqual,
  moveNodeWithinSiblings,
  updateNodeGlyph,
  updateNodeOverlays,
  updateNodeTextField,
} from "./sourceTree";

const INTERNATIONAL_START_FEN =
  "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20";

function getDefaultStartFenForVariant(variantId?: string): string {
  // For now we use the 10x10 international baseline.
  // This matches current board logic and PDN GameType 20 input.
  if (!variantId) return INTERNATIONAL_START_FEN;
  return INTERNATIONAL_START_FEN;
}

export type SourceEditorState = {
  initialDocument: SourceDocument;
  document: SourceDocument;
  selectedNodeId: string | null;
  lastImportSummary: string | null;
};

export type SourceEditorAction =
  | { type: "SELECT_NODE"; nodeId: string }
  | { type: "UPDATE_SELECTED_NODE_COMMENT"; value: string }
  | { type: "UPDATE_SELECTED_NODE_PREMOVE_COMMENT"; value: string }
  | { type: "UPDATE_SELECTED_NODE_GLYPH"; glyph: MoveGlyph | "" }
  | {
      type: "UPDATE_SELECTED_NODE_OVERLAYS";
      highlights?: HighlightSpec[];
      arrows?: ArrowSpec[];
      routes?: RouteSpec[];
    }
  | {
      type: "UPDATE_SOURCE_META_FIELD";
      field: keyof SourceMetadata;
      value: string;
    }
  | { type: "SET_ROOT_FEN"; fen: string }
  | { type: "RESET_TO_INITIAL_DOCUMENT" }
  | { type: "IMPORT_PDN_TEXT"; pdn: string }
  | {
      type: "APPLY_MOVE_AT_SELECTED_NODE";
      move: AnalysisMove;
      fenAfter: string;
    }
  | {
      type: "MOVE_VARIATION";
      nodeId: string;
      direction: "up" | "down";
    }
  | {
      type: "UPDATE_SELECTED_NODE_ENGINE";
      engine: EngineAnalysisSnapshot;
    };

function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotKey(snapshot: EngineAnalysisSnapshot | undefined): string {
  if (!snapshot) return "";
  return JSON.stringify({
    status: snapshot.status,
    bestMove: snapshot.bestMove ?? null,
    evaluation: snapshot.evaluation ?? null,
    depth: snapshot.depth ?? null,
    pv: snapshot.pv ?? [],
    errorMessage: snapshot.errorMessage ?? null,
  });
}

function parsePdnHeaderTags(pdn: string): Partial<SourceMetadata> {
  const result: Partial<SourceMetadata> = {};
  const tagRegex = /\[\s*([A-Za-z][A-Za-z0-9_]*)\s+"([^"]*)"\s*\]/g;
  let match: RegExpExecArray | null = tagRegex.exec(pdn);

  while (match) {
    const rawKey = match[1].toLowerCase();
    const value = match[2].trim();
    if (!value) {
      match = tagRegex.exec(pdn);
      continue;
    }

    if (rawKey === "event") result.event = value;
    if (rawKey === "site") result.site = value;
    if (rawKey === "date") result.date = value;
    if (rawKey === "round") result.round = value;
    if (rawKey === "white") result.white = value;
    if (rawKey === "black") result.black = value;
    if (rawKey === "author") result.author = value;
    if (rawKey === "publication") result.publication = value;
    if (rawKey === "result") result.result = value;
    if (rawKey === "annotator") result.annotator = value;

    match = tagRegex.exec(pdn);
  }

  return result;
}

function parsePdnTagMap(pdn: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRegex = /\[\s*([A-Za-z][A-Za-z0-9_]*)\s+"([^"]*)"\s*\]/g;
  let match: RegExpExecArray | null = tagRegex.exec(pdn);
  while (match) {
    tags[match[1]] = match[2].trim();
    match = tagRegex.exec(pdn);
  }
  return tags;
}

function stripParenthesizedVariations(text: string): string {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

function parsePdnMoveTokens(pdn: string): { moves: string[]; resultToken?: string } {
  const withoutTags = pdn.replace(/^\s*\[.*\]\s*$/gm, " ");
  const withoutComments = withoutTags
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n\r]*/g, " ");
  const withoutVars = stripParenthesizedVariations(withoutComments);
  const text = withoutVars.replace(/\s+/g, " ").trim();
  if (!text) return { moves: [] };

  const tokens = text.split(" ");
  const moves: string[] = [];
  let resultToken: string | undefined;

  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) continue;

    // Allow compact forms like "1.32-28" or "1...17-22"
    const moveToken = token.replace(/^\d+\.(\.\.)?/, "");
    if (!moveToken) continue;
    if (/^\d+\.(\.\.)?$/.test(token) || /^\d+\.+$/.test(token)) continue;
    if (/^\$\d+$/.test(token)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|2-0|0-2|1-1|0-0|\*)$/.test(moveToken)) {
      resultToken = moveToken;
      break;
    }
    if (/^\d+(?:[-x]\d+)+$/.test(moveToken)) {
      moves.push(moveToken);
    }
  }

  return { moves, resultToken };
}

type PdnToken =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comment"; text: string }
  | { type: "nag"; value: string }
  | { type: "move"; notation: string }
  | { type: "result"; value: string };

const NAG_TO_GLYPH: Record<string, MoveGlyph> = {
  "$1": "!",
  "$2": "?",
  "$3": "!!",
  "$4": "??",
  "$5": "!?",
  "$6": "?!",
  "!": "!",
  "?": "?",
  "!!": "!!",
  "??": "??",
  "!?": "!?",
  "?!": "?!",
};

function normalizeNagToGlyph(value: string): MoveGlyph | null {
  return NAG_TO_GLYPH[value] ?? null;
}

function splitMoveAndSuffix(token: string): { move: string; suffix: string | null } {
  const match = token.match(/^(\d+(?:[-x]\d+)+)(!!|\?\?|!\?|\?!|!|\?)?$/);
  if (!match) {
    return { move: token, suffix: null };
  }
  return { move: match[1], suffix: match[2] ?? null };
}

function tokenizePdnMovetext(pdn: string): PdnToken[] {
  const withoutTags = pdn.replace(/^\s*\[.*\]\s*$/gm, " ");
  const regex =
    /\{[^}]*\}|\(|\)|\d+\.(?:\.\.)?\d+(?:[-x]\d+)+(?:!!|\?\?|!\?|\?!|!|\?)?|\d+\.(?:\.\.)?|\d+\.+|\d+(?:[-x]\d+)+(?:!!|\?\?|!\?|\?!|!|\?)?|1-0|0-1|1\/2-1\/2|2-0|0-2|1-1|0-0|\*|\$\d+|!!|\?\?|!\?|\?!|!|\?|;[^\n\r]*/g;
  const matches = withoutTags.match(regex) ?? [];
  const tokens: PdnToken[] = [];

  for (const raw of matches) {
    const token = raw.trim();
    if (!token) continue;
    if (token.startsWith(";")) continue;
    if (token.startsWith("{") && token.endsWith("}")) {
      const text = token.slice(1, -1).trim();
      if (text) tokens.push({ type: "comment", text });
      continue;
    }
    if (token === "(") {
      tokens.push({ type: "lparen" });
      continue;
    }
    if (token === ")") {
      tokens.push({ type: "rparen" });
      continue;
    }
    if (/^\$\d+$/.test(token)) {
      tokens.push({ type: "nag", value: token });
      continue;
    }
    if (/^(!!|\?\?|!\?|\?!|!|\?)$/.test(token)) {
      tokens.push({ type: "nag", value: token });
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|2-0|0-2|1-1|0-0|\*)$/.test(token)) {
      tokens.push({ type: "result", value: token });
      continue;
    }
    if (/^\d+\.(\.\.)?$/.test(token) || /^\d+\.+$/.test(token)) continue;

    const moveToken = token.replace(/^\d+\.(\.\.)?/, "");
    const split = splitMoveAndSuffix(moveToken);
    if (/^\d+(?:[-x]\d+)+$/.test(split.move)) {
      tokens.push({ type: "move", notation: split.move });
      if (split.suffix) {
        tokens.push({ type: "nag", value: split.suffix });
      }
    }
  }

  return tokens;
}

function setNodeGlyph(
  document: SourceDocument,
  nodeId: string,
  glyph: MoveGlyph
): SourceDocument {
  return {
    ...document,
    nodes: document.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            glyphs: [glyph],
          }
        : n
    ),
  };
}

function extractResultFromTokens(tokens: PdnToken[]): string | undefined {
  for (const token of tokens) {
    if (token.type === "result") return token.value;
  }
  return undefined;
}

function makeLocalizedText(text: string) {
  return {
    values: {
      en: text,
      nl: text,
    },
  };
}

function appendNodeText(
  document: SourceDocument,
  nodeId: string,
  field: "comment" | "preMoveComment",
  text: string
): SourceDocument {
  if (!text.trim()) return document;
  const node = document.nodes.find((n) => n.id === nodeId);
  if (!node) return document;
  const existing =
    (field === "comment" ? node.comment : node.preMoveComment)?.values?.en ?? "";
  const nextText = existing ? `${existing}\n${text}` : text;

  return {
    ...document,
    nodes: document.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            [field]: makeLocalizedText(nextText),
          }
        : n
    ),
  };
}

function findExistingChildForMoveInDoc(
  document: SourceDocument,
  parentId: string,
  move: AnalysisMove
) {
  const parent = document.nodes.find((n) => n.id === parentId);
  if (!parent) return null;
  for (const childId of parent.childrenIds ?? []) {
    const child = document.nodes.find((n) => n.id === childId);
    if (!child) continue;
    if (movesEqual(child.move, move)) return child;
  }
  return null;
}

function resolvePdnMoveOnBoard(
  boardInput: ReturnType<typeof fenToBoardState>,
  notation: string
) {
  const board = cloneBoard(boardInput);
  const side = board.sideToMove;
  const isCapture = notation.includes("x");
  const path = notation
    .split(isCapture ? "x" : "-")
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
  if (path.length < 2) return null;

  let fenAfter: string | null = null;
  let from: number | undefined;
  let to: number | undefined;
  let captures: number[] = [];

  if (!isCapture) {
    from = path[0];
    to = path[path.length - 1];
    const targets = getTargetsForSquare(board, from);
    const legal = targets.find((target) => target.to === to && !target.isCapture);
    if (!legal) return null;
    const result = applyEngineMove(board, {
      from,
      to,
      path: [from, to],
      captures: [],
      side,
    });
    fenAfter = result.fenAfter;
  } else {
    from = path[0];
    to = path[path.length - 1];
    let resolvedPath: number[] | null = null;
    let resolvedCaptures: number[] | null = null;

    if (path.length > 2) {
      let workingBoard = board;
      const fullCaptures: number[] = [];

      for (let i = 1; i < path.length; i += 1) {
        const stepFrom = path[i - 1];
        const stepTo = path[i];
        const targets =
          i === 1
            ? getTargetsForSquare(workingBoard, stepFrom)
            : getContinuationCaptureTargets(
                workingBoard,
                stepFrom,
                path.slice(0, i),
                fullCaptures
              );
        const target = targets.find((item) => item.to === stepTo && item.isCapture);
        if (!target || target.captured == null) {
          fullCaptures.length = 0;
          break;
        }
        fullCaptures.push(target.captured);
        if (i < path.length - 1) {
          workingBoard = applyPartialCaptureStep(
            workingBoard,
            stepFrom,
            stepTo,
            target.captured
          );
        }
      }

      if (fullCaptures.length === path.length - 1) {
        resolvedPath = path;
        resolvedCaptures = fullCaptures;
      }
    } else {
      const globalMax = getMaxCaptureCount(board);
      const sequences = getAllCaptureSequencesForSquare(board, from).filter(
        (seq) => seq.to === to && seq.captures.length === globalMax
      );
      if (sequences.length > 0) {
        resolvedPath = sequences[0].path;
        resolvedCaptures = sequences[0].captures;
      }
    }

    if (!resolvedPath || !resolvedCaptures) return null;
    captures = resolvedCaptures;
    const result = applyCompleteCaptureMove(
      board,
      from,
      resolvedPath,
      resolvedCaptures,
      side
    );
    fenAfter = result.fenAfter;
    to = resolvedPath[resolvedPath.length - 1];
  }

  if (!fenAfter || from == null || to == null) return null;

  return {
    nextBoard: fenToBoardState(fenAfter),
    move: {
      notation,
      side,
      from,
      to,
      path,
      captures,
    } satisfies AnalysisMove,
    fenAfter,
  };
}

function tryBuildDocumentFromPdnMoves(
  baseDocument: SourceDocument,
  pdn: string
): SourceDocument {
  const tags = parsePdnTagMap(pdn);
  const setup = (tags.SetUp ?? tags.Setup ?? "").trim();
  const fenTag = (tags.FEN ?? tags.Fen ?? tags.fen ?? "").trim();
  const rootFen =
    setup === "1" && fenTag
      ? fenTag
      : getDefaultStartFenForVariant(baseDocument.variantId);

  const rootBoard = fenToBoardState(rootFen);

  const rootId = crypto.randomUUID();
  const rootNode = {
    id: rootId,
    parentId: null,
    childrenIds: [] as string[],
    variationOf: null,
    isMainline: true,
    plyIndex: 0,
    fenAfter: rootFen,
    glyphs: [] as MoveGlyph[],
    labels: [] as string[],
    highlights: [],
    arrows: [],
    routes: [],
  };

  let document: SourceDocument = {
    ...baseDocument,
    initialFen: rootFen,
    rootNodeId: rootId,
    nodes: [rootNode],
  };

  const tokens = tokenizePdnMovetext(pdn);
  let i = 0;
  const parseSequence = (
    startNodeId: string,
    startBoard: ReturnType<typeof fenToBoardState>,
    inVariation: boolean
  ): { endIndex: number; lastNodeId: string } => {
    let currentNodeId = startNodeId;
    let board = cloneBoard(startBoard);
    let lastNodeId = startNodeId;
    let pendingPreMoveComment = "";
    let lastMoveBaseNodeId: string | null = null;
    let lastMoveBaseBoard: ReturnType<typeof fenToBoardState> | null = null;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === "rparen") {
        return { endIndex: i, lastNodeId };
      }

      if (token.type === "lparen") {
        const variationStartNodeId = lastMoveBaseNodeId ?? currentNodeId;
        const variationStartBoard = lastMoveBaseBoard
          ? cloneBoard(lastMoveBaseBoard)
          : cloneBoard(board);
        i += 1;
        parseSequence(variationStartNodeId, variationStartBoard, true);
        if (i < tokens.length && tokens[i]?.type === "rparen") {
          i += 1;
        }
        continue;
      }

      if (token.type === "comment") {
        if (lastNodeId !== startNodeId) {
          document = appendNodeText(document, lastNodeId, "comment", token.text);
        } else {
          pendingPreMoveComment = pendingPreMoveComment
            ? `${pendingPreMoveComment}\n${token.text}`
            : token.text;
        }
        i += 1;
        continue;
      }

      if (token.type === "result") {
        i += 1;
        continue;
      }

      if (token.type === "nag") {
        const glyph = normalizeNagToGlyph(token.value);
        if (glyph && lastNodeId !== startNodeId) {
          document = setNodeGlyph(document, lastNodeId, glyph);
        }
        i += 1;
        continue;
      }

      if (token.type === "move") {
        const boardBeforeMove = cloneBoard(board);
        const nodeBeforeMoveId = currentNodeId;
        const resolved = resolvePdnMoveOnBoard(board, token.notation);
        if (!resolved) {
          i += 1;
          continue;
        }

        const existing = findExistingChildForMoveInDoc(
          document,
          currentNodeId,
          resolved.move
        );

        let nextNodeId: string;
        if (existing) {
          nextNodeId = existing.id;
        } else {
          const parent = document.nodes.find((n) => n.id === currentNodeId);
          if (!parent) {
            i += 1;
            continue;
          }
          const hasMainChild = (parent.childrenIds ?? []).some((childId) => {
            const child = document.nodes.find((n) => n.id === childId);
            return child?.isMainline !== false;
          });
          const nextNode = createChildNode({
            parent,
            move: resolved.move,
            fenAfter: resolved.fenAfter,
            isMainline: !inVariation && !hasMainChild,
          });
          document = appendChildToDocument({
            document,
            parentNodeId: currentNodeId,
            childNode: nextNode,
          });
          nextNodeId = nextNode.id;
        }

        if (pendingPreMoveComment) {
          document = appendNodeText(
            document,
            nextNodeId,
            "preMoveComment",
            pendingPreMoveComment
          );
          pendingPreMoveComment = "";
        }

        currentNodeId = nextNodeId;
        lastNodeId = nextNodeId;
        board = resolved.nextBoard;
        lastMoveBaseNodeId = nodeBeforeMoveId;
        lastMoveBaseBoard = boardBeforeMove;
        i += 1;
      }
    }

    return { endIndex: i, lastNodeId };
  };

  parseSequence(rootNode.id, rootBoard, false);

  return document;
}

export function sourceEditorReducer(
  state: SourceEditorState,
  action: SourceEditorAction
): SourceEditorState {
  switch (action.type) {
    case "SELECT_NODE":
      return {
        ...state,
        selectedNodeId: action.nodeId,
      };

    case "UPDATE_SELECTED_NODE_COMMENT": {
      if (!state.selectedNodeId) return state;

      return {
        ...state,
        document: updateNodeTextField(
          state.document,
          state.selectedNodeId,
          "comment",
          action.value
        ),
        lastImportSummary: null,
      };
    }

    case "UPDATE_SELECTED_NODE_PREMOVE_COMMENT": {
      if (!state.selectedNodeId) return state;

      return {
        ...state,
        document: updateNodeTextField(
          state.document,
          state.selectedNodeId,
          "preMoveComment",
          action.value
        ),
        lastImportSummary: null,
      };
    }

    case "UPDATE_SELECTED_NODE_GLYPH": {
      if (!state.selectedNodeId) return state;

      return {
        ...state,
        document: updateNodeGlyph(
          state.document,
          state.selectedNodeId,
          action.glyph
        ),
        lastImportSummary: null,
      };
    }

    case "UPDATE_SELECTED_NODE_OVERLAYS": {
      if (!state.selectedNodeId) return state;

      return {
        ...state,
        document: updateNodeOverlays(state.document, state.selectedNodeId, {
          highlights: action.highlights,
          arrows: action.arrows,
          routes: action.routes,
        }),
        lastImportSummary: null,
      };
    }

    case "UPDATE_SOURCE_META_FIELD": {
      const current = state.document.sourceMeta ?? {};
      return {
        ...state,
        document: {
          ...state.document,
          sourceMeta: {
            ...current,
            [action.field]: action.value.trim() || undefined,
          },
        },
        lastImportSummary: null,
      };
    }

    case "SET_ROOT_FEN": {
      const rootNode = state.document.nodes.find(
        (node) => node.id === state.document.rootNodeId
      );

      if (!rootNode) return state;

      const nextRoot = {
        ...rootNode,
        fenAfter: action.fen,
        childrenIds: [],
      };

      return {
        ...state,
        selectedNodeId: nextRoot.id,
        document: {
          ...state.document,
          initialFen: action.fen,
          nodes: [nextRoot],
        },
        lastImportSummary: "FEN imported. Root position replaced.",
      };
    }

    case "RESET_TO_INITIAL_DOCUMENT":
      return {
        ...state,
        document: cloneDocument(state.initialDocument),
        selectedNodeId:
          state.initialDocument.rootNodeId ??
          state.initialDocument.nodes[0]?.id ??
          null,
        lastImportSummary: null,
      };

    case "IMPORT_PDN_TEXT": {
      const tags = parsePdnHeaderTags(action.pdn);
      const parsed = parsePdnMoveTokens(action.pdn);
      const pdnTokens = tokenizePdnMovetext(action.pdn);
      const tokenResult = extractResultFromTokens(pdnTokens);
      const rebuiltDocument = tryBuildDocumentFromPdnMoves(state.document, action.pdn);
      return {
        ...state,
        document: {
          ...rebuiltDocument,
          format: "pdn",
          kind: "pdn_game",
          rawText: action.pdn,
          sourceMeta: {
            ...(rebuiltDocument.sourceMeta ?? {}),
            ...tags,
            result:
              tags.result ??
              tokenResult ??
              parsed.resultToken ??
              rebuiltDocument.sourceMeta?.result,
          },
        },
        selectedNodeId:
          rebuiltDocument.nodes[rebuiltDocument.nodes.length - 1]?.id ??
          rebuiltDocument.rootNodeId,
        lastImportSummary: `PDN imported: ${Math.max(
          rebuiltDocument.nodes.length - 1,
          0
        )} moves, ${
          rebuiltDocument.nodes.filter((n) => n.isMainline === false).length
        } variations, ${
          rebuiltDocument.nodes.filter(
            (n) =>
              !!n.comment?.values?.en ||
              !!n.comment?.values?.nl ||
              !!n.preMoveComment?.values?.en ||
              !!n.preMoveComment?.values?.nl
          ).length
        } commented nodes, ${
          rebuiltDocument.nodes.filter((n) => (n.glyphs?.length ?? 0) > 0).length
        } glyph nodes.`,
      };
    }

    case "APPLY_MOVE_AT_SELECTED_NODE": {
      const selectedNode = state.document.nodes.find(
        (node) => node.id === state.selectedNodeId
      );

      if (!selectedNode) return state;

      const existingChild = findExistingChildByMove(
        state.document,
        selectedNode,
        action.move
      );

      if (existingChild) {
        return {
          ...state,
          selectedNodeId: existingChild.id,
        };
      }

      const isMainline = selectedNode.childrenIds.length === 0;

      const newChild = createChildNode({
        parent: selectedNode,
        move: action.move,
        fenAfter: action.fenAfter,
        isMainline,
      });

      return {
        ...state,
        document: appendChildToDocument({
          document: state.document,
          parentNodeId: selectedNode.id,
          childNode: newChild,
        }),
        selectedNodeId: newChild.id,
        lastImportSummary: null,
      };
    }

    case "MOVE_VARIATION": {
      return {
        ...state,
        document: moveNodeWithinSiblings(
          state.document,
          action.nodeId,
          action.direction
        ),
        lastImportSummary: null,
      };
    }

    case "UPDATE_SELECTED_NODE_ENGINE": {
      if (!state.selectedNodeId) return state;
      const currentNode = state.document.nodes.find(
        (node) => node.id === state.selectedNodeId
      );
      if (!currentNode) return state;
      if (snapshotKey(currentNode.engine) === snapshotKey(action.engine)) {
        return state;
      }
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map((node) =>
            node.id === state.selectedNodeId
              ? {
                  ...node,
                  engine: action.engine,
                }
              : node
          ),
        },
        lastImportSummary: null,
      };
    }

    default:
      return state;
  }
}