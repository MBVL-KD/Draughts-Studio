/**
 * Bundel 12b: map preview count input to authoring correctValue.
 */

export function parsePreviewCountDraft(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}
