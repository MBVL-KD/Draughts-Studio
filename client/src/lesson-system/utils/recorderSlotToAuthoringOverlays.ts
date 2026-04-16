import type { ArrowSpec, HighlightColor, HighlightSpec } from "../types/presentationTypes";
import type { AuthoringOverlaySpec, OverlaySemanticStyle } from "../types/authoring/timelineTypes";

function mapRecorderColor(c: HighlightColor): OverlaySemanticStyle {
  switch (c) {
    case "success":
      return "good";
    case "warning":
      return "hint";
    case "danger":
      return "danger";
    case "info":
      return "candidate";
    default:
      return "focus";
  }
}

export type RecorderSlotOverlayLike = {
  highlights: HighlightSpec[];
  arrows: ArrowSpec[];
};

/** Maps board-scene recorder slot overlays into authoring timeline overlays. */
export function recorderSlotOverlayToAuthoringOverlays(
  slot: RecorderSlotOverlayLike
): AuthoringOverlaySpec[] {
  const out: AuthoringOverlaySpec[] = [];
  for (const h of slot.highlights) {
    out.push({
      type: "highlight",
      id: h.id,
      squares: [...h.squares],
      style: mapRecorderColor(h.color),
      pulse: h.pulse,
    });
  }
  for (const a of slot.arrows) {
    if (a.from == null || a.to == null) continue;
    out.push({
      type: "arrow",
      id: a.id,
      from: a.from,
      to: a.to,
      style: mapRecorderColor(a.color),
      dashed: a.dashed,
      label:
        a.label && String(a.label).trim()
          ? { values: { en: String(a.label).trim(), nl: String(a.label).trim() } }
          : undefined,
    });
  }
  return out;
}
