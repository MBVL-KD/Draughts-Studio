type DocumentThresholds = {
  warnBytes: number;
  highWarnBytes: number;
};

const DEFAULT_THRESHOLDS: DocumentThresholds = {
  warnBytes: 250 * 1024,
  highWarnBytes: 1024 * 1024,
};

export function estimateJsonBytes(input: unknown): number {
  const json = JSON.stringify(input ?? null);
  return Buffer.byteLength(json, "utf8");
}

export function warnIfLargeDocument(
  kind: "book" | "source" | "importJob" | "importItem",
  appId: string,
  bytes: number,
  thresholds: DocumentThresholds = DEFAULT_THRESHOLDS
) {
  if (bytes >= thresholds.highWarnBytes) {
    console.warn(
      `[size] high ${kind} size appId=${appId} bytes=${bytes} threshold=${thresholds.highWarnBytes}`
    );
    return;
  }
  if (bytes >= thresholds.warnBytes) {
    console.warn(
      `[size] warn ${kind} size appId=${appId} bytes=${bytes} threshold=${thresholds.warnBytes}`
    );
  }
}

export function warnIfBookCounts(
  appId: string,
  counts: { lessons: number; steps: number }
) {
  console.warn(
    `[size] book counts appId=${appId} lessons=${counts.lessons} steps=${counts.steps}`
  );
}

export function warnIfSourceCounts(
  appId: string,
  counts: { nodes: number }
) {
  console.warn(`[size] source counts appId=${appId} nodes=${counts.nodes}`);
}

