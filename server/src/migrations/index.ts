import { migrateBookV1ToV2 } from "./books/v1_to_v2";
import { migrateSourceV1ToV2 } from "./sources/v1_to_v2";

export type MigrationReport<T> = {
  document: T;
  changed: boolean;
  fromVersion: number;
  toVersion: number;
  warnings?: string[];
};

type VersionedDoc = {
  schemaVersion?: number;
  [key: string]: unknown;
};

function getSchemaVersion(doc: VersionedDoc): number {
  const version = doc.schemaVersion;
  return typeof version === "number" && Number.isFinite(version) ? version : 1;
}

export function migrateBookToLatest<T extends VersionedDoc>(book: T): MigrationReport<T> {
  const fromVersion = getSchemaVersion(book);
  let current: T = book;
  const warnings: string[] = [];

  if (fromVersion < 2) {
    current = migrateBookV1ToV2(current) as T;
    warnings.push("migrated book schema from v1 to v2");
  }

  const toVersion = getSchemaVersion(current);
  return {
    document: current,
    changed: fromVersion !== toVersion,
    fromVersion,
    toVersion,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function migrateSourceToLatest<T extends VersionedDoc>(source: T): MigrationReport<T> {
  const fromVersion = getSchemaVersion(source);
  let current: T = source;
  const warnings: string[] = [];

  if (fromVersion < 2) {
    current = migrateSourceV1ToV2(current) as T;
    warnings.push("migrated source schema from v1 to v2");
  }

  const toVersion = getSchemaVersion(current);
  return {
    document: current,
    changed: fromVersion !== toVersion,
    fromVersion,
    toVersion,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

