import type { StepMoment } from "../types/authoring/timelineTypes";

/** Subset of `StepMoment` copied between moments (Bundel 10a). */
export type MomentPresentationRuntimeClip = Pick<
  StepMoment,
  "overlays" | "glyphMarkers" | "coach" | "camera" | "fx" | "ui" | "timing"
>;

export function extractPresentationRuntimeClip(moment: StepMoment): MomentPresentationRuntimeClip {
  return {
    overlays: moment.overlays ? structuredClone(moment.overlays) : undefined,
    glyphMarkers: moment.glyphMarkers ? structuredClone(moment.glyphMarkers) : undefined,
    coach: moment.coach ? structuredClone(moment.coach) : undefined,
    camera: moment.camera ? structuredClone(moment.camera) : undefined,
    fx: moment.fx ? structuredClone(moment.fx) : undefined,
    ui: moment.ui ? structuredClone(moment.ui) : undefined,
    timing: moment.timing ? structuredClone(moment.timing) : undefined,
  };
}

export function hasAnyPresentationRuntimeClip(clip: MomentPresentationRuntimeClip): boolean {
  return !!(
    (clip.overlays && clip.overlays.length > 0) ||
    (clip.glyphMarkers && clip.glyphMarkers.length > 0) ||
    (clip.coach && clip.coach.length > 0) ||
    (clip.camera && clip.camera.length > 0) ||
    (clip.fx && clip.fx.length > 0) ||
    (clip.ui && clip.ui.length > 0) ||
    clip.timing
  );
}

/** Merge clip onto target; clip fields overwrite when defined (including empty arrays). */
export function mergePresentationRuntimeClip(
  target: StepMoment,
  clip: MomentPresentationRuntimeClip
): StepMoment {
  return {
    ...target,
    overlays: clip.overlays !== undefined ? structuredClone(clip.overlays) : target.overlays,
    glyphMarkers:
      clip.glyphMarkers !== undefined ? structuredClone(clip.glyphMarkers) : target.glyphMarkers,
    coach: clip.coach !== undefined ? structuredClone(clip.coach) : target.coach,
    camera: clip.camera !== undefined ? structuredClone(clip.camera) : target.camera,
    fx: clip.fx !== undefined ? structuredClone(clip.fx) : target.fx,
    ui: clip.ui !== undefined ? structuredClone(clip.ui) : target.ui,
    timing: clip.timing !== undefined ? structuredClone(clip.timing) : target.timing,
  };
}
