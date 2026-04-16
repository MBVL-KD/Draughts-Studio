import { randomUUID } from "crypto";

export function ensureCanonicalIdPair<T extends Record<string, unknown>>(
  doc: T,
  canonicalKey: string,
  legacyKey = "id"
): T {
  const canonical = doc[canonicalKey];
  const legacy = doc[legacyKey];
  const value =
    typeof canonical === "string" && canonical.length > 0
      ? canonical
      : typeof legacy === "string" && legacy.length > 0
      ? legacy
      : randomUUID();

  return {
    ...doc,
    [canonicalKey]: value,
    [legacyKey]: value,
  };
}

export function assertCanonicalIdsMatch(
  legacyId: string | undefined,
  canonicalId: string | undefined,
  context: string
) {
  if (!legacyId || !canonicalId) return;
  if (legacyId !== canonicalId) {
    throw new Error(`Canonical ID mismatch in ${context}: ${legacyId} !== ${canonicalId}`);
  }
}
