import type { LocalizedText } from "./i18nTypes";
import type { ArrowSpec, HighlightSpec, RouteSpec } from "./presentationTypes";

export type SourceKind =
  | "pdn_game"
  | "analysis"
  | "puzzle_tree"
  | "study"
  | "manual_line"
  | "lesson_source";

export type SourceFormat =
  | "pdn"
  | "manual"
  | "generated";

export type MoveGlyph =
  | "!"
  | "?"
  | "!!"
  | "??"
  | "!?"
  | "?!";

export type EngineProvider = "scan-wasm" | "scan-native";

export type EngineCandidate = {
  move: string;
  evaluation?: number;
  pv?: string[];
};

export type EngineAnalysisStatus =
  | "idle"
  | "loading"
  | "ok"
  | "unsupported_variant"
  | "not_ready"
  | "error";

export type EngineAnalysisSnapshot = {
  provider: EngineProvider;
  status: EngineAnalysisStatus;

  liveMove?: string;
  bestMove?: string;
  ponderMove?: string;

  evaluation?: number;
  pv?: string[];
  candidates?: EngineCandidate[];

  depth?: number;
  multiPv?: number;

  analyzedAt?: string;
  rawOutput?: string[];
  errorMessage?: string;
};

export type SourceDocument = {
  id: string;
  /** Canonical id when mirrored from API (`sourceId` on wire). */
  sourceId?: string;
  schemaVersion?: number;
  revision?: number;

  kind: SourceKind;
  format: SourceFormat;

  title: LocalizedText;
  description?: LocalizedText;

  variantId: string;
  rulesetId?: string;

  initialFen: string;
  rootNodeId: string;

  nodes: AnalysisNode[];

  rawText?: string;
  sourceMeta?: SourceMetadata;

  tags?: string[];

  createdAt: string;
  updatedAt: string;
};

export type SourceMetadata = {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  author?: string;
  publication?: string;
  result?: string;
  annotator?: string;
};

export type AnalysisNode = {
  id: string;
  parentId: string | null;
  childrenIds: string[];

  variationOf?: string | null;
  isMainline?: boolean;

  plyIndex: number;

  move?: AnalysisMove;
  fenAfter: string;

  comment?: LocalizedText;
  preMoveComment?: LocalizedText;

  glyphs?: MoveGlyph[];
  labels?: string[];
  highlights?: HighlightSpec[];
  arrows?: ArrowSpec[];
  routes?: RouteSpec[];

  teaching?: {
    isCritical?: boolean;
    isPuzzleStart?: boolean;
    isPuzzleSolution?: boolean;
    motifTags?: string[];
  };

  engine?: EngineAnalysisSnapshot;
};

export type AnalysisMove = {
  notation: string;
  side: "W" | "B";

  from?: number;
  to?: number;
  path?: number[];
  captures?: number[];

  moveNumber?: number;
};