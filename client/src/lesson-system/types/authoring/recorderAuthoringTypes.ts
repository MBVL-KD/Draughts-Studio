import type { LocalizedText } from "../i18nTypes";
import type { MoveGlyph } from "../analysisTypes";

/** Stored on moments created from step recorder (data-first; UI/runtime later). */
export type RecorderMoveSemanticRole =
  | "best"
  | "candidate"
  | "mistake"
  | "blunder"
  | "idea";

/** Per-ply metadata while authoring a recording (before conversion to timeline). */
export type RecorderAuthoringAnnotationInput = {
  glyph?: MoveGlyph;
  preText?: LocalizedText;
  postText?: LocalizedText;
  semanticRole?: RecorderMoveSemanticRole;
};
