import { randomUUID } from "crypto";

type SourceLike = {
  id?: string;
  sourceId?: string;
  schemaVersion?: number;
  [key: string]: unknown;
};

function resolveSyncedId(canonical?: string, legacy?: string): string {
  if (canonical && canonical.trim()) return canonical;
  if (legacy && legacy.trim()) return legacy;
  return randomUUID();
}

function syncIdPair<T extends Record<string, unknown>>(
  input: T,
  canonicalKey: string,
  legacyKey = "id"
): T {
  const canonical = typeof input[canonicalKey] === "string" ? (input[canonicalKey] as string) : undefined;
  const legacy = typeof input[legacyKey] === "string" ? (input[legacyKey] as string) : undefined;
  const value = resolveSyncedId(canonical, legacy);
  return {
    ...input,
    [canonicalKey]: value,
    [legacyKey]: value,
  };
}

export function migrateSourceV1ToV2(input: SourceLike): SourceLike {
  const synced = syncIdPair(input, "sourceId");
  return {
    ...synced,
    schemaVersion: 2,
    revision: input.revision,
  };
}

