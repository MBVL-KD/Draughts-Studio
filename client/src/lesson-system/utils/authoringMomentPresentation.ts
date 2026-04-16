import type { MoveGlyph } from "../types/analysisTypes";
import type {
  AuthoringOverlaySpec,
  GlyphMarkerSpec,
  OverlaySemanticStyle,
  StepMoment,
} from "../types/authoring/timelineTypes";
import { createLocalizedText } from "./i18nHelpers";

/** Canonical semantic styles for authoring (renderer maps to colors). */
export const OVERLAY_SEMANTIC_STYLE_OPTIONS: readonly OverlaySemanticStyle[] = [
  "focus",
  "hint",
  "good",
  "danger",
  "illegal",
  "candidate",
  "target",
  "selected",
  "promotion",
  "neutral",
] as const;

export const AUTHORING_GLYPH_OPTIONS: readonly MoveGlyph[] = [
  "!",
  "?",
  "!!",
  "??",
  "!?",
  "?!",
];

function overlaysOrEmpty(m: StepMoment): AuthoringOverlaySpec[] {
  return m.overlays ?? [];
}

function glyphsOrEmpty(m: StepMoment): GlyphMarkerSpec[] {
  return m.glyphMarkers ?? [];
}

export function setMomentOverlays(moment: StepMoment, overlays: AuthoringOverlaySpec[]): StepMoment {
  return { ...moment, overlays: overlays.length ? overlays : undefined };
}

export function setMomentGlyphMarkers(
  moment: StepMoment,
  glyphMarkers: GlyphMarkerSpec[]
): StepMoment {
  return { ...moment, glyphMarkers: glyphMarkers.length ? glyphMarkers : undefined };
}

export function appendOverlay(moment: StepMoment, overlay: AuthoringOverlaySpec): StepMoment {
  return setMomentOverlays(moment, [...overlaysOrEmpty(moment), overlay]);
}

export function replaceOverlayAt(
  moment: StepMoment,
  index: number,
  overlay: AuthoringOverlaySpec
): StepMoment {
  const list = [...overlaysOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = overlay;
  return setMomentOverlays(moment, list);
}

export function removeOverlayAt(moment: StepMoment, index: number): StepMoment {
  const list = overlaysOrEmpty(moment).filter((_, i) => i !== index);
  return setMomentOverlays(moment, list);
}

export function moveOverlayUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...overlaysOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return setMomentOverlays(moment, list);
}

export function moveOverlayDown(moment: StepMoment, index: number): StepMoment {
  const list = [...overlaysOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return setMomentOverlays(moment, list);
}

export function appendGlyphMarker(moment: StepMoment, spec: GlyphMarkerSpec): StepMoment {
  return setMomentGlyphMarkers(moment, [...glyphsOrEmpty(moment), spec]);
}

export function replaceGlyphMarkerAt(
  moment: StepMoment,
  index: number,
  spec: GlyphMarkerSpec
): StepMoment {
  const list = [...glyphsOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = spec;
  return setMomentGlyphMarkers(moment, list);
}

export function removeGlyphMarkerAt(moment: StepMoment, index: number): StepMoment {
  const list = glyphsOrEmpty(moment).filter((_, i) => i !== index);
  return setMomentGlyphMarkers(moment, list);
}

export function moveGlyphMarkerUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...glyphsOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return setMomentGlyphMarkers(moment, list);
}

export function moveGlyphMarkerDown(moment: StepMoment, index: number): StepMoment {
  const list = [...glyphsOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return setMomentGlyphMarkers(moment, list);
}

export function createDefaultHighlightOverlay(): AuthoringOverlaySpec {
  return {
    type: "highlight",
    id: crypto.randomUUID(),
    squares: [31],
    style: "focus",
    pulse: false,
  };
}

export function createDefaultArrowOverlay(): AuthoringOverlaySpec {
  return {
    type: "arrow",
    id: crypto.randomUUID(),
    from: 31,
    to: 35,
    style: "hint",
    dashed: false,
  };
}

export function createDefaultRouteOverlay(): AuthoringOverlaySpec {
  return {
    type: "route",
    id: crypto.randomUUID(),
    path: [31, 35],
    style: "candidate",
    showDots: true,
    showNumbers: false,
  };
}

export function createDefaultLabelOverlay(): AuthoringOverlaySpec {
  return {
    type: "label",
    id: crypto.randomUUID(),
    square: 31,
    text: createLocalizedText("Note", "Notitie"),
    style: "neutral",
  };
}

export function createDefaultGlyphMarker(): GlyphMarkerSpec {
  return {
    id: crypto.randomUUID(),
    glyph: "!",
    square: 31,
  };
}
