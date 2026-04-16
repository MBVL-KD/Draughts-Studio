import { loadScanModule } from "./loadScanModule";
import { mapVariantToScanVariant } from "./mapVariantToEngine";
import type {
  AnalyzePositionRequest,
  AnalyzePositionResult,
} from "./types";

export interface EngineAdapter {
  analyzePosition(
    request: AnalyzePositionRequest
  ): Promise<AnalyzePositionResult>;
}

export class ScanWasmEngineAdapter implements EngineAdapter {
  async analyzePosition(
    request: AnalyzePositionRequest
  ): Promise<AnalyzePositionResult> {
    const mappedVariant = mapVariantToScanVariant(request.variantId);

    if (!mappedVariant) {
      return {
        ok: false,
        provider: request.provider,
        variantId: request.variantId,
        fen: request.fen,
        status: "unsupported_variant",
        errorMessage: `Variant '${request.variantId}' is nog niet gekoppeld aan Scan.`,
      };
    }

    try {
      const scan = await loadScanModule();

      const keys = Object.keys(scan ?? {});
      const rawOutput = [
        `Scan module loaded successfully.`,
        `Mapped variant: ${mappedVariant}`,
        `Requested depth: ${request.depth ?? "default"}`,
        `Requested multiPv: ${request.multiPv ?? 1}`,
        `Available module keys: ${keys.join(", ") || "(none)"}`,
        `FEN: ${request.fen}`,
      ];

      return {
        ok: false,
        provider: request.provider,
        variantId: request.variantId,
        fen: request.fen,
        status: "not_ready",
        rawOutput,
      };
    } catch (error) {
      return {
        ok: false,
        provider: request.provider,
        variantId: request.variantId,
        fen: request.fen,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Scan WASM error",
      };
    }
  }
}