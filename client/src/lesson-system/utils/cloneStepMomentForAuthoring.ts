import type { GlyphMarkerSpec, StepMoment } from "../types/authoring/timelineTypes";

function newId(): string {
  return crypto.randomUUID();
}

function remapGlyphMarkers(markers: GlyphMarkerSpec[] | undefined): GlyphMarkerSpec[] | undefined {
  if (!markers?.length) return markers;
  return markers.map((g) => ({
    ...g,
    id: g.id != null ? newId() : undefined,
  }));
}

/**
 * Deep-clone a moment for timeline duplicate / preset workflows.
 * - New top-level `id`
 * - `branchAction` removed (avoid duplicate branch wiring)
 * - Fresh `id`s on overlays / glyph markers when present
 */
export function cloneStepMomentForAuthoringDuplicate(original: StepMoment): StepMoment {
  const base = structuredClone(original) as StepMoment;
  const clone: StepMoment = {
    ...base,
    id: newId(),
    branchAction: undefined,
    editorMeta: base.editorMeta ? { ...base.editorMeta } : undefined,
    glyphMarkers: remapGlyphMarkers(base.glyphMarkers),
  };

  if (clone.overlays?.length) {
    clone.overlays = clone.overlays.map((o) => {
      const copy = { ...o } as (typeof o) & { id?: string };
      if ("id" in copy && copy.id != null) {
        copy.id = newId();
      }
      return copy;
    });
  }

  return clone;
}
