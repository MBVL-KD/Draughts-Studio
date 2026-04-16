import { useEffect, useMemo, useRef, useState } from "react";
import { loadScanModule } from "../loadScanModule";
import type {
  EngineAnalysisSnapshot,
  EngineCandidate,
} from "../../lesson-system/types/analysisTypes";

export type UseNodeEngineAnalysisArgs = {
  enabled: boolean;
  provider?: "scan-wasm" | "scan-native";
  variantId: string;
  fen: string | null | undefined;
  depth?: number;
  multiPv?: number;
};

const inMemoryCache = new Map<string, EngineAnalysisSnapshot>();

function makeKey(args: UseNodeEngineAnalysisArgs) {
  return JSON.stringify({
    provider: args.provider ?? "scan-wasm",
    variantId: args.variantId,
    fen: args.fen,
    depth: args.depth ?? 12,
    multiPv: args.multiPv ?? 1,
  });
}

function mapVariantToScanVariant(variantId: string): string | null {
  switch (variantId) {
    case "international":
      return "normal";
    case "frisian":
      return "frisian";
    case "killer":
      return "killer";
    case "breakthrough":
      return "bt";
    case "losing":
      return "losing";
    default:
      return null;
  }
}

function normalizeEvaluation(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizePv(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const values = raw.filter((item): item is string => typeof item === "string");
    return values.length > 0 ? values : undefined;
  }

  if (typeof raw === "string") {
    const values = raw.split(/\s+/).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  return undefined;
}

function pickCandidates(result: Record<string, unknown>): EngineCandidate[] | undefined {
  const raw = result.candidates;

  if (!Array.isArray(raw)) return undefined;

  const candidates = raw
    .map((item): EngineCandidate | null => {
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const move =
        typeof row.move === "string"
          ? row.move
          : typeof row.bestMove === "string"
          ? row.bestMove
          : undefined;

      if (!move) return null;

      return {
        move,
        evaluation: normalizeEvaluation(row.evaluation ?? row.score ?? row.eval),
        pv: normalizePv(row.pv),
      };
    })
    .filter((item): item is EngineCandidate => item !== null);

  return candidates.length > 0 ? candidates : undefined;
}

function pickRawOutput(result: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(result.rawOutput)) return undefined;

  const values = result.rawOutput.filter((item): item is string => typeof item === "string");
  return values.length > 0 ? values : undefined;
}

function looksUsableFen(fen: string): boolean {
  return fen.includes(":W") && fen.includes(":B") && /\d/.test(fen);
}

export function useNodeEngineAnalysis(args: UseNodeEngineAnalysisArgs) {
  const {
    enabled,
    provider = "scan-wasm",
    variantId,
    fen,
    depth = 12,
    multiPv = 1,
  } = args;

  const [state, setState] = useState<EngineAnalysisSnapshot | null>(null);
  const requestIdRef = useRef(0);

  const requestKey = useMemo(
    () =>
      makeKey({
        enabled,
        provider,
        variantId,
        fen,
        depth,
        multiPv,
      }),
    [enabled, provider, variantId, fen, depth, multiPv]
  );

  useEffect(() => {
    if (!enabled || !fen || !looksUsableFen(fen)) {
      setState(null);
      return;
    }

    const cached = inMemoryCache.get(requestKey);
    if (cached) {
      setState(cached);
      return;
    }

    const scanVariant = mapVariantToScanVariant(variantId);
    if (!scanVariant) {
      setState({
        provider,
        status: "unsupported_variant",
        errorMessage: `Variant '${variantId}' is not yet mapped to Scan.`,
        depth,
        multiPv,
      });
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    setState({
      provider,
      status: "loading",
      depth,
      multiPv,
    });

    const run = async () => {
      try {
        const scan = await loadScanModule();
        const scanApi = scan as Record<string, unknown>;

        const analyzeFn =
          (scanApi.analyzePosition as
            | ((payload: Record<string, unknown>) => unknown | Promise<unknown>)
            | undefined) ??
          (scanApi.analyze as
            | ((payload: Record<string, unknown>) => unknown | Promise<unknown>)
            | undefined);

        if (!analyzeFn) {
          const snapshot: EngineAnalysisSnapshot = {
            provider,
            status: "not_ready",
            errorMessage: "Scan loaded, but no analyze function was found yet.",
            depth,
            multiPv,
          };

          inMemoryCache.set(requestKey, snapshot);
          if (requestIdRef.current === currentRequestId) {
            setState(snapshot);
          }
          return;
        }

        const rawResult = await analyzeFn({
          variant: scanVariant,
          fen,
          depth,
          multiPv,
          onProgress: (progress: {
            type: "info" | "done";
            liveMove?: string;
            bestMove?: string;
            ponder?: string;
            evaluation?: number;
            pv?: string[];
            depth?: number;
          }) => {
            if (requestIdRef.current !== currentRequestId) return;

            setState((prev) => ({
              provider,
              status: progress.type === "done" ? "ok" : "loading",
              liveMove: progress.liveMove ?? prev?.liveMove,
              bestMove: progress.bestMove ?? prev?.bestMove,
              ponderMove: progress.ponder ?? prev?.ponderMove,
              evaluation: progress.evaluation ?? prev?.evaluation,
              pv: progress.pv?.length ? progress.pv : prev?.pv,
              candidates: prev?.candidates,
              depth,
              multiPv,
              analyzedAt: prev?.analyzedAt,
              rawOutput: prev?.rawOutput,
              errorMessage: undefined,
            }));
          },
        });

        const result = (rawResult ?? {}) as Record<string, unknown>;

        const snapshot: EngineAnalysisSnapshot = {
          provider,
          status: "ok",
          liveMove:
            typeof result.liveMove === "string"
              ? result.liveMove
              : Array.isArray(result.pv) && typeof result.pv[0] === "string"
              ? result.pv[0]
              : undefined,
          bestMove:
            typeof result.bestMove === "string"
              ? result.bestMove
              : typeof result.move === "string"
              ? result.move
              : undefined,
          ponderMove:
            typeof result.ponderMove === "string"
              ? result.ponderMove
              : typeof result.ponder === "string"
              ? result.ponder
              : undefined,
          evaluation: normalizeEvaluation(result.evaluation ?? result.score ?? result.eval),
          pv: normalizePv(result.pv),
          candidates: pickCandidates(result),
          depth,
          multiPv,
          analyzedAt: new Date().toISOString(),
          rawOutput: pickRawOutput(result),
        };

        inMemoryCache.set(requestKey, snapshot);

        if (requestIdRef.current === currentRequestId) {
          setState(snapshot);
        }
      } catch (error) {
        const snapshot: EngineAnalysisSnapshot = {
          provider,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "Unknown engine error",
          depth,
          multiPv,
        };

        if (requestIdRef.current === currentRequestId) {
          setState(snapshot);
        }
      }
    };

    void run();
  }, [enabled, fen, provider, requestKey, variantId, depth, multiPv]);

  return state;
}