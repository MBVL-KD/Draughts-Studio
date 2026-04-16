/**
 * Runtime playback validation — safe to copy `movesEqual`, `runtimeMoveValidationFlow`,
 * `evaluatePuzzleMoveFallbackCore`, and `runtimeValidationTypes` into Roblox (Luau port).
 */
export * from "./runtimeValidationTypes";
export * from "./movesEqual";
export * from "./scanEvalInterpretation";
export * from "./evaluatePuzzleMoveFallbackCore";
export * from "./runtimeMoveValidationFlow";
export * from "./buildRuntimeValidation";
export {
  resolveNotationLineToStructuredMoves,
  resolveNotationLineToStructuredMovesDetailed,
} from "./resolveNotationLineToStructuredMoves";
