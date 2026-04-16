import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type {
  CameraAction,
  FxAction,
} from "../types/authoring/presentationRuntimeTypes";
import type {
  AuthoringOverlaySpec,
  OverlaySemanticStyle,
  StepMoment,
} from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { ArrowSpec, HighlightColor, HighlightSpec, RouteSpec } from "../types/presentationTypes";
import { readLocalizedText } from "./i18nHelpers";

/**
 * Resolved board + overlay state for studio board/preview when authoring a step moment.
 * Single entry point — keep preview logic out of scattered components.
 */
/** Resolved glyph badge for board preview (square anchor). */
export type AuthoringSquareGlyph = {
  id: string;
  square: number;
  text: string;
};

export type AuthoringPreviewResolved = {
  fen: string;
  sideToMove: "white" | "black";
  highlights: HighlightSpec[];
  arrows: ArrowSpec[];
  routes: RouteSpec[];
  /** Optional square-anchored glyph badges from `moment.glyphMarkers`. */
  squareGlyphs?: AuthoringSquareGlyph[];
  /** Bundel 8b: coach lines for lightweight studio/preview strip (not executed as NPC). */
  coachPreviewLines?: string[];
  /** First / merged hint text from `ui.showHint`. */
  uiHintPreview?: string;
  /** Banner text + style from `ui.showBanner` (last banner wins for style if multiple). */
  uiBannerPreview?: { text: string; style?: "info" | "warning" | "success" | "error" };
  /** Human-readable timing summary (authoring only). */
  timingSummary?: string;
  /** Dev-facing labels for camera/fx/toggleHud (data-first preview). */
  runtimeDevLabels?: string[];
  /** Short line for UI (moment title / caption / body). */
  headline?: string;
  /**
   * When true, consumers should use legacy `LessonStep.presentation` overlays for highlights/arrows/routes.
   * When false, use `highlights` / `arrows` / `routes` from this object.
   */
  preferStubPresentationForOverlays: boolean;
};

function semanticToHighlightColor(style: OverlaySemanticStyle): HighlightColor {
  switch (style) {
    case "good":
    case "promotion":
      return "success";
    case "danger":
    case "illegal":
      return "danger";
    case "hint":
    case "candidate":
      return "warning";
    case "focus":
    case "target":
    case "selected":
      return "primary";
    case "neutral":
    default:
      return "info";
  }
}

function stableOverlayId(momentId: string, kind: string, index: number, sub?: string): string {
  return `auth:${momentId}:${kind}:${index}${sub ? `:${sub}` : ""}`;
}

function convertOverlays(
  moment: StepMoment,
  language: LanguageCode
): { highlights: HighlightSpec[]; arrows: ArrowSpec[]; routes: RouteSpec[] } {
  const highlights: HighlightSpec[] = [];
  const arrows: ArrowSpec[] = [];
  const routes: RouteSpec[] = [];
  const list = moment.overlays ?? [];

  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i]!;
    try {
      appendOneOverlay(raw, moment.id, i, language, highlights, arrows, routes);
    } catch {
      // noop-safe: skip malformed overlay entries
    }
  }

  return { highlights, arrows, routes };
}

function appendOneOverlay(
  o: AuthoringOverlaySpec,
  momentId: string,
  index: number,
  language: LanguageCode,
  highlights: HighlightSpec[],
  arrows: ArrowSpec[],
  routes: RouteSpec[]
): void {
  const color = semanticToHighlightColor(o.style ?? "neutral");

  switch (o.type) {
    case "highlight": {
      if (!o.squares?.length) return;
      highlights.push({
        id: o.id ?? stableOverlayId(momentId, "hl", index),
        squares: [...o.squares],
        color,
        pulse: o.pulse ?? false,
        fill: true,
        outline: true,
      });
      return;
    }
    case "arrow": {
      arrows.push({
        id: o.id ?? stableOverlayId(momentId, "ar", index),
        from: o.from,
        to: o.to,
        color,
        curved: false,
        dashed: o.dashed ?? false,
        label: o.label ? readLocalizedText(o.label, language) : undefined,
      });
      return;
    }
    case "route": {
      if (!o.path?.length) return;
      routes.push({
        id: o.id ?? stableOverlayId(momentId, "rt", index),
        squares: [...o.path],
        color,
        closed: false,
        dashed: false,
      });
      return;
    }
    case "label": {
      const text = readLocalizedText(o.text, language);
      if (!text.trim()) return;
      arrows.push({
        id: o.id ?? stableOverlayId(momentId, "lb", index),
        from: o.square,
        to: o.square,
        color: o.style ? semanticToHighlightColor(o.style) : "info",
        curved: false,
        dashed: false,
        label: text,
      });
      return;
    }
    default:
      return;
  }
}

function resolveSquareGlyphs(
  moment: StepMoment,
  language: LanguageCode
): AuthoringSquareGlyph[] {
  const markers = moment.glyphMarkers ?? [];
  const out: AuthoringSquareGlyph[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const g = markers[i]!;
    if (typeof g.square !== "number" || g.square < 1 || g.square > 50) continue;
    const extra = g.text ? readLocalizedText(g.text, language).trim() : "";
    const text = extra ? `${g.glyph} ${extra}` : g.glyph;
    out.push({
      id: g.id ?? stableOverlayId(moment.id, "glyph", i),
      square: g.square,
      text,
    });
  }
  return out;
}

function coachPreviewLinesFromMoment(
  moment: StepMoment,
  language: LanguageCode
): string[] {
  return (moment.coach ?? [])
    .map((c) => readLocalizedText(c.text, language).trim())
    .filter(Boolean);
}

function uiPreviewFromMoment(
  moment: StepMoment,
  language: LanguageCode
): { uiHintPreview?: string; uiBannerPreview?: AuthoringPreviewResolved["uiBannerPreview"] } {
  const hints: string[] = [];
  let banner: AuthoringPreviewResolved["uiBannerPreview"];
  for (const u of moment.ui ?? []) {
    if (u.type === "showHint") {
      const t = readLocalizedText(u.text, language).trim();
      if (t) hints.push(t);
    }
    if (u.type === "showBanner") {
      const t = readLocalizedText(u.text, language).trim();
      if (t) banner = { text: t, style: u.style };
    }
  }
  return {
    uiHintPreview: hints.length ? hints.join(" · ") : undefined,
    uiBannerPreview: banner,
  };
}

function timingSummaryFromMoment(moment: StepMoment): string | undefined {
  const t = moment.timing;
  if (!t) return undefined;
  const parts: string[] = [];
  if (t.autoPlay) parts.push("autoPlay");
  if (t.startDelayMs != null) parts.push(`start +${t.startDelayMs}ms`);
  if (t.durationMs != null) parts.push(`duration ${t.durationMs}ms`);
  if (t.waitForUser) parts.push("wait user");
  if (t.pauseAfterMs != null) parts.push(`pause +${t.pauseAfterMs}ms`);
  return parts.length ? parts.join(" · ") : undefined;
}

function cameraActionDevLabel(c: CameraAction): string {
  switch (c.type) {
    case "none":
      return "none";
    case "focusSquare":
      return `focusSquare@${c.square}${c.zoom != null ? ` z=${c.zoom}` : ""}`;
    case "focusMove":
      return `focusMove ${c.from}→${c.to}`;
    case "frameArea":
      return `frameArea(${c.squares?.length ?? 0} sq)`;
    case "followPiece":
      return `follow@${c.square}`;
    case "reset":
      return "reset";
    default:
      return "camera";
  }
}

function fxActionDevLabel(f: FxAction): string {
  switch (f.type) {
    case "squarePulse":
      return `squarePulse[${f.squares?.join(",") ?? ""}]`;
    case "pieceGlow":
      return `pieceGlow[${f.squares?.join(",") ?? ""}]`;
    case "particles":
      return `particles:${f.particleKind}`;
    case "screenFx":
      return `screenFx:${f.effect}`;
    case "soundCue":
      return `sound:${f.soundId}`;
    default:
      return "fx";
  }
}

function runtimeDevLabelsFromMoment(moment: StepMoment): string[] {
  const out: string[] = [];
  for (const c of moment.camera ?? []) {
    out.push(`camera · ${cameraActionDevLabel(c)}`);
  }
  for (const f of moment.fx ?? []) {
    out.push(`fx · ${fxActionDevLabel(f)}`);
  }
  for (const u of moment.ui ?? []) {
    if (u.type === "toggleHud") {
      out.push(`ui · HUD ${u.visible ? "show" : "hide"}`);
    }
  }
  return out;
}

function headlineFromMoment(moment: StepMoment, language: LanguageCode): string | undefined {
  const a = readLocalizedText(moment.title, language).trim();
  const b = readLocalizedText(moment.caption, language).trim();
  const c = readLocalizedText(moment.body, language).trim();
  return a || b || c || undefined;
}

function fenFromPositionRef(
  moment: StepMoment,
  fallbackFen: string
): { fen: string; usedRef: boolean } {
  const ref = moment.positionRef;
  if (!ref) return { fen: fallbackFen, usedRef: false };
  if (ref.type === "fen" && ref.fen?.trim()) {
    return { fen: ref.fen.trim(), usedRef: true };
  }
  // lessonSnapshot / sourceNode: not resolved in studio yet — noop-safe fallback
  return { fen: fallbackFen, usedRef: false };
}

/**
 * @param authoringStep — v2 authoring step (initial position + timeline)
 * @param moment — selected moment, or `null` for step-level baseline (no moment overlays)
 */
export function resolveAuthoringPreviewState(
  authoringStep: AuthoringLessonStep,
  moment: StepMoment | null,
  options: { language: LanguageCode }
): AuthoringPreviewResolved {
  const { language } = options;

  const baseFen = authoringStep.initialState.fen?.trim() ?? "";
  const baseSide = authoringStep.initialState.sideToMove ?? "white";

  if (!moment) {
    return {
      fen: baseFen,
      sideToMove: baseSide,
      highlights: [],
      arrows: [],
      routes: [],
      squareGlyphs: undefined,
      coachPreviewLines: undefined,
      uiHintPreview: undefined,
      uiBannerPreview: undefined,
      timingSummary: undefined,
      runtimeDevLabels: undefined,
      headline: undefined,
      preferStubPresentationForOverlays: true,
    };
  }

  const { fen: resolvedFen } = fenFromPositionRef(moment, baseFen);
  const converted = convertOverlays(moment, language);
  const squareGlyphs = resolveSquareGlyphs(moment, language);
  const hasMomentOverlays =
    converted.highlights.length > 0 ||
    converted.arrows.length > 0 ||
    converted.routes.length > 0;
  const hasGlyphs = squareGlyphs.length > 0;
  const useAuthoringPresentationLayer = hasMomentOverlays || hasGlyphs;

  const coachPreviewLines = coachPreviewLinesFromMoment(moment, language);
  const { uiHintPreview, uiBannerPreview } = uiPreviewFromMoment(moment, language);
  const timingSummary = timingSummaryFromMoment(moment);
  const runtimeDevLabels = runtimeDevLabelsFromMoment(moment);

  return {
    fen: resolvedFen,
    sideToMove: baseSide,
    highlights: converted.highlights,
    arrows: converted.arrows,
    routes: converted.routes,
    squareGlyphs: hasGlyphs ? squareGlyphs : undefined,
    coachPreviewLines: coachPreviewLines.length ? coachPreviewLines : undefined,
    uiHintPreview,
    uiBannerPreview,
    timingSummary,
    runtimeDevLabels: runtimeDevLabels.length ? runtimeDevLabels : undefined,
    headline: headlineFromMoment(moment, language),
    preferStubPresentationForOverlays: !useAuthoringPresentationLayer,
  };
}
