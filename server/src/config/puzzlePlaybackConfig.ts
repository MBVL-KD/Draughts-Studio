/**
 * Central configuration for puzzle playback / Scan-assisted validation (Roblox + server).
 * Tune thresholds here only — avoid scattering magic numbers.
 */

export const PUZZLE_PLAYBACK_CONFIG = {
  /** Lesson / sequence teaching: never use Scan fallback (enforced in policy helpers). */
  requireExactForLessons: true,

  /** Only these step types enable Scan fallback by default (when no puzzleMeta). */
  scanFallbackStepTypes: ["goal_challenge"] as const,

  /**
   * Imported / tagged puzzles often use `sequence` + `puzzleMeta`.
   * When true, those steps may use Scan fallback if other conditions hold.
   */
  scanFallbackWhenPuzzleMetaPresent: true,

  /** Max drop in absolute eval (centipawn-like Scan units) vs baseline when accepting fallback. */
  evalTolerance: 0.85,

  /** Minimum absolute eval to count as clearly winning for the side to move. */
  winningThreshold: 1.25,

  /** Below this absolute eval we treat as equal / unclear territory. */
  equalBandMax: 0.45,

  /** Depth when runtime runs an ad-hoc Scan on resulting FEN (server-side helper). */
  scanDepth: 14,

  multiPv: 1,
} as const;

export type PuzzlePlaybackConfig = typeof PUZZLE_PLAYBACK_CONFIG;
