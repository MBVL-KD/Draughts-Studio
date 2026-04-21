/**
 * Builds a JSON-serializable, Roblox-oriented view of `authoringV2` timeline ministeps.
 * LocalizedText nodes become `{ display, values }` so runtimes can switch language without
 * re-fetching when `values` is present.
 */

function readLocalizedText(value: unknown, language: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const values = (value as { values?: Record<string, string> }).values;
  if (!values || typeof values !== "object") return "";
  const fromLang = values[language];
  if (typeof fromLang === "string" && fromLang.trim()) return fromLang;
  const en = values.en;
  if (typeof en === "string") return en;
  const first = Object.values(values).find((v) => typeof v === "string");
  return typeof first === "string" ? first : "";
}

function isLocalizedTextNode(value: unknown): value is { values: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const values = (value as { values?: unknown }).values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;
  return Object.values(values as Record<string, unknown>).every((v) => typeof v === "string");
}

function transformValue(value: unknown, language: string): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => transformValue(v, language));
  if (typeof value !== "object") return value;
  if (isLocalizedTextNode(value)) {
    return {
      display: readLocalizedText(value, language),
      values: { ...value.values },
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = transformValue(v, language);
  }
  return out;
}

export type AuthoringTimelinePlaybackBlock = {
  authoringStepId?: string;
  authoringStepKind?: string;
  /** Ordered ministeps (Studio `StepMoment[]`), localized for playback. */
  authoringTimeline: unknown[];
};

function normalizeMomentShape(moment: unknown, index: number): unknown {
  if (!moment || typeof moment !== "object" || Array.isArray(moment)) {
    return { id: `moment-${index + 1}`, type: "unknown" };
  }
  const o = moment as Record<string, unknown>;
  const next = { ...o };
  if (typeof next.id !== "string" || !next.id.trim()) {
    next.id = `moment-${index + 1}`;
  }
  if (typeof next.type !== "string" || !next.type.trim()) {
    next.type = "unknown";
  }
  return next;
}

/**
 * Returns a block to merge onto the playback payload when `authoringStep.timeline` exists
 * (including empty array). Returns `undefined` when there is no authoring step object.
 */
export function buildAuthoringTimelinePlaybackBlock(
  authoringStep: unknown,
  language: string
): AuthoringTimelinePlaybackBlock | undefined {
  if (!authoringStep || typeof authoringStep !== "object" || Array.isArray(authoringStep)) {
    return undefined;
  }
  const s = authoringStep as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(s, "timeline")) {
    return undefined;
  }
  const rawTimeline = s.timeline;
  if (!Array.isArray(rawTimeline)) {
    return undefined;
  }

  const authoringTimeline = rawTimeline.map((moment, index) =>
    normalizeMomentShape(transformValue(moment, language), index)
  );

  const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : undefined;
  const kind = typeof s.kind === "string" && s.kind.trim() ? s.kind.trim() : undefined;

  return {
    ...(id ? { authoringStepId: id } : {}),
    ...(kind ? { authoringStepKind: kind } : {}),
    authoringTimeline,
  };
}
