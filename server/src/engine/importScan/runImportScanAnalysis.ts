import { mapVariantToScanVariant } from "../scan/mapVariantToScanVariant";
import type { ImportScanResult } from "../../types/importTypes";
import { loadScanModuleForImport } from "./loadScanModuleForImport";

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
  const analyzed = await api.analyze({
    variant: mappedVariant,
    fen,
    depth,
    multiPv,
  });

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
