import { mapVariantToScanVariant } from "../scan/mapVariantToScanVariant";
import type { ImportScanResult } from "../../types/importTypes";
import { loadScanModuleForImport } from "./loadScanModuleForImport";

/** Deep scans can stall the import job; callers may skip the puzzle on this error. */
export class ImportScanTimeoutError extends Error {
  override name = "ImportScanTimeoutError";
  constructor(
    public readonly depth: number,
    public readonly fenPreview: string,
    public readonly timeoutMs: number
  ) {
    super(`Import scan exceeded ${timeoutMs}ms at depth ${depth} (fen ${fenPreview.slice(0, 48)}…)`);
  }
}

const IMPORT_SCAN_TIMEOUT_MS = 5000;
/** Apply wall-clock cap only for heavy engine settings (Slagzet import “level 25” class). */
const IMPORT_SCAN_TIMEOUT_MIN_DEPTH = 22;

export async function runImportScanAnalysis(params: {
  variantId: string;
  fen: string;
  depth?: number;
  multiPv?: number;
}): Promise<ImportScanResult> {
  const mappedVariant = mapVariantToScanVariant(params.variantId);
  if (!mappedVariant) {
    throw new Error(
      `Scan: variant '${params.variantId}' is not mapped to a Scan engine variant.`
    );
  }

  const fen = (params.fen ?? "").trim();
  if (!fen) {
    throw new Error("Scan: missing FEN.");
  }

  const depth =
    typeof params.depth === "number" && Number.isFinite(params.depth)
      ? Math.max(1, Math.floor(params.depth))
      : 10;
  const multiPv =
    typeof params.multiPv === "number" && Number.isFinite(params.multiPv)
      ? Math.max(1, Math.floor(params.multiPv))
      : 1;

  const api = await loadScanModuleForImport();
  const runAnalyze = () =>
    api.analyze({
      variant: mappedVariant,
      fen,
      depth,
      multiPv,
    });

  const analyzed =
    depth >= IMPORT_SCAN_TIMEOUT_MIN_DEPTH
      ? await Promise.race([
          runAnalyze(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new ImportScanTimeoutError(depth, fen, IMPORT_SCAN_TIMEOUT_MS));
            }, IMPORT_SCAN_TIMEOUT_MS);
          }),
        ])
      : await runAnalyze();

  return {
    bestMove: analyzed.bestMove,
    ponder: analyzed.ponderMove,
    evaluation:
      typeof analyzed.evaluation === "number" && Number.isFinite(analyzed.evaluation)
        ? analyzed.evaluation
        : null,
    pv: analyzed.pv,
    depthUsed: depth,
  };
}
