export type EngineProvider = "scan-wasm" | "scan-native";

export type EngineVariant =
  | "international"
  | "frisian"
  | "killer"
  | "breakthrough"
  | "losing";

export type AnalyzePositionRequest = {
  provider: EngineProvider;
  variantId: string;
  fen: string;
  depth?: number;
  multiPv?: number;
};

export type EngineCandidate = {
  move: string;
  evaluation?: number;
  pv?: string[];
};

export type AnalyzePositionResult = {
  ok: boolean;
  provider: EngineProvider;
  variantId: string;
  fen: string;

  status:
    | "ok"
    | "unsupported_variant"
    | "not_ready"
    | "error";

  bestMove?: string;
  evaluation?: number;
  pv?: string[];
  candidates?: EngineCandidate[];
  rawOutput?: string[];
  errorMessage?: string;
};