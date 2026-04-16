export function getDocumentId(value: { id?: string; bookId?: string; sourceId?: string }) {
  return value.id ?? value.bookId ?? value.sourceId ?? "";
}

export function getDocumentRevision(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "revision" in value &&
    typeof (value as { revision?: unknown }).revision === "number" &&
    Number.isFinite((value as { revision: number }).revision)
  ) {
    return (value as { revision: number }).revision;
  }
  return 1;
}
