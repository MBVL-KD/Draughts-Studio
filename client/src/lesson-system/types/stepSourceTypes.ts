import type { MoveGlyph } from "./analysisTypes";
import type { LocalizedText } from "./i18nTypes";
import type { ArrowSpec, HighlightSpec, RouteSpec } from "./presentationTypes";

export type StepSourceNodeSnapshot = {
  nodeId: string;
  plyIndex: number;
  notation?: string;
  fenAfter?: string;
  glyphs?: MoveGlyph[];
  /** Board highlights for this ply (merged in preview with step presentation). */
  highlights?: HighlightSpec[];
  arrows?: ArrowSpec[];
  routes?: RouteSpec[];
  preMoveComment?: LocalizedText;
  comment?: LocalizedText;
  /** When false, step presentation highlights are hidden for this replay frame. Default: true */
  replayShowHighlights?: boolean;
  /** When false, step presentation arrows are hidden for this replay frame. Default: true */
  replayShowArrows?: boolean;
};

export type StepSourceRef = {
  sourceId: string;

  // waar start deze step inhoudelijk?
  anchorNodeId?: string | null;

  // voor ranges, autoplay, fragments
  startNodeId?: string | null;
  endNodeId?: string | null;

  // voor focus op een specifiek moment
  focusNodeId?: string | null;

  lineMode?: "mainline" | "variation" | "custom";

  /** External import trace (e.g. Slagzet). */
  importedAt?: string;
  snapshotFen?: string;

  // optional node timeline copied from source, used for richer preview playback
  nodeTimeline?: StepSourceNodeSnapshot[];
};