type ScanLike = {
  cwrap?: (...args: any[]) => any;
  __lastStdout?: string[];
  __lastStderr?: string[];
  [key: string]: any;
};

type AnalyzePayload = {
  variant: string;
  fen: string;
  depth: number;
  multiPv?: number;
  onProgress?: (event: {
    type: "info" | "done";
    liveMove?: string;
    bestMove?: string;
    ponder?: string;
    evaluation?: number;
    pv?: string[];
    depth?: number;
  }) => void;
};

type BridgeResponse = {
  ok?: boolean;
  bestMove?: string;
  ponder?: string;
  evaluation?: number | string;
  pv?: string[];
  rawOutput?: string[];
  error?: string;
};

type AnalyzeResult = {
  liveMove?: string;
  bestMove?: string;
  ponderMove?: string;
  evaluation?: number;
  pv?: string[];
  rawOutput?: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var __scanProgressCallback:
    | ((raw: string) => void)
    | undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeRawOutput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizePv(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function createScanApi(
  scan: ScanLike,
  options?: { silent?: boolean }
) {
  const silent = options?.silent === true;
  const log = silent ? () => {} : console.log.bind(console);

  log("RAW SCAN OBJECT", scan);
  log("RAW SCAN KEYS", Object.keys(scan ?? {}));

  const analyzeFen =
    typeof scan.cwrap === "function"
      ? scan.cwrap("scan_analyze_fen", "string", ["string", "string", "number", "number"])
      : null;

  return {
    
    async analyze(payload: AnalyzePayload): Promise<AnalyzeResult> {
      log("SCAN INPUT", payload);

      if (!analyzeFen) {
        throw new Error("scan_analyze_fen is not available on this build.");
      }

      const variant = payload.variant || "normal";
      const fen = payload.fen || "";
      const depth = Number.isFinite(payload.depth) ? payload.depth : 6;
      const multiPv = Number.isFinite(payload.multiPv) ? (payload.multiPv as number) : 1;

      if (!fen.trim()) {
        throw new Error("Missing FEN for engine analysis.");
      }

      if (Array.isArray(scan.__lastStdout)) scan.__lastStdout.length = 0;
      if (Array.isArray(scan.__lastStderr)) scan.__lastStderr.length = 0;

      const previousProgressCallback = globalThis.__scanProgressCallback;

      globalThis.__scanProgressCallback = (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as {
            type?: "info" | "done";
            liveMove?: string;
            bestMove?: string;
            ponder?: string;
            evaluation?: number | string;
            pv?: string[];
            depth?: number;
          };

          payload.onProgress?.({
            type: parsed.type === "done" ? "done" : "info",
            liveMove: typeof parsed.liveMove === "string" ? parsed.liveMove : undefined,
            bestMove: typeof parsed.bestMove === "string" ? parsed.bestMove : undefined,
            ponder: typeof parsed.ponder === "string" ? parsed.ponder : undefined,
            evaluation: toFiniteNumber(parsed.evaluation),
            pv: normalizePv(parsed.pv),
            depth: typeof parsed.depth === "number" ? parsed.depth : undefined,
          });
        } catch (error) {
          if (!silent) console.warn("Bad scan progress payload", raw, error);
        }
      };

      let raw: unknown;

      try {
        raw = analyzeFen(variant, fen, depth, multiPv);
      } catch (error) {
        globalThis.__scanProgressCallback = previousProgressCallback;

        const extraLogs = [
          ...normalizeRawOutput(scan.__lastStdout),
          ...normalizeRawOutput(scan.__lastStderr),
        ];

        const suffix =
          extraLogs.length > 0 ? ` | logs: ${extraLogs.join(" | ")}` : "";

        throw new Error(
          `Bridge call failed: ${
            error instanceof Error
              ? error.message
              : typeof error === "string"
              ? error
              : JSON.stringify(error)
          }${suffix}`
        );
      }

      globalThis.__scanProgressCallback = previousProgressCallback;

      log("SCAN BRIDGE RAW", raw);

      if (typeof raw !== "string" || raw.trim() === "") {
        throw new Error("scan_analyze_fen returned an empty response.");
      }

      let parsed: BridgeResponse;
      try {
        parsed = JSON.parse(raw) as BridgeResponse;
      } catch {
        throw new Error(`Bridge returned invalid JSON: ${raw}`);
      }

      const mergedRawOutput = [
        ...normalizeRawOutput(parsed.rawOutput),
        ...normalizeRawOutput(scan.__lastStdout),
        ...normalizeRawOutput(scan.__lastStderr),
      ];

      if (!parsed.ok) {
        throw new Error(
          parsed.error
            ? `${parsed.error}${
                mergedRawOutput.length ? ` | logs: ${mergedRawOutput.join(" | ")}` : ""
              }`
            : `Unknown bridge error${
                mergedRawOutput.length ? ` | logs: ${mergedRawOutput.join(" | ")}` : ""
              }`
        );
      }

      return {
        liveMove: Array.isArray(parsed.pv) && parsed.pv[0] ? parsed.pv[0] : undefined,
        bestMove: typeof parsed.bestMove === "string" ? parsed.bestMove : undefined,
        ponderMove: typeof parsed.ponder === "string" ? parsed.ponder : undefined,
        evaluation: toFiniteNumber(parsed.evaluation),
        pv: normalizePv(parsed.pv),
        rawOutput: mergedRawOutput,
      };
    },
  };
}