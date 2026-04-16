import { randomUUID } from "crypto";

type AnyDoc = Record<string, unknown>;

function resolveCanonicalPairValue(doc: AnyDoc, canonicalKey: string): string {
  const canonical = doc[canonicalKey];
  const legacy = doc.id;
  if (typeof canonical === "string" && canonical.length > 0) return canonical;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  return randomUUID();
}

export function ensureImportJobCanonicalIds<T extends AnyDoc>(doc: T): T {
  const value = resolveCanonicalPairValue(doc, "jobId");
  return {
    ...doc,
    id: value,
    jobId: value,
  };
}

export function ensureImportItemCanonicalIds<T extends AnyDoc>(doc: T): T {
  const value = resolveCanonicalPairValue(doc, "itemId");
  return {
    ...doc,
    id: value,
    itemId: value,
  };
}

export function assertImportCanonicalIdsMatch(
  legacyId: string | undefined,
  canonicalId: string | undefined,
  context: string
) {
  if (!legacyId || !canonicalId) return;
  if (legacyId !== canonicalId) {
    throw new Error(`Import canonical ID mismatch in ${context}: ${legacyId} !== ${canonicalId}`);
  }
}
