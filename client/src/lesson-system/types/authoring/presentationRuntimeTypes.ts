import type { LocalizedText } from "./coreTypes";

/**
 * Presentation / runtime directives on a moment.
 * Runtimes MUST be noop-safe: unknown or unsupported actions are skipped (dev log optional).
 */

export type TimingSpec = {
  autoPlay?: boolean;
  startDelayMs?: number;
  durationMs?: number;
  waitForUser?: boolean;
  pauseAfterMs?: number;
};

export type CoachTone =
  | "neutral"
  | "warm"
  | "excited"
  | "warning"
  | "corrective"
  | "celebratory";

export type CoachAction = {
  npcId?: string;
  mode: "bubble" | "panel" | "voice" | "caption";
  text: LocalizedText;
  tone?: CoachTone;
  autoAdvanceAfterMs?: number;
};

export type CameraAction =
  | { type: "none" }
  | { type: "focusSquare"; square: number; zoom?: number; durationMs?: number }
  | { type: "focusMove"; from: number; to: number; zoom?: number; durationMs?: number }
  | { type: "frameArea"; squares: number[]; durationMs?: number }
  | { type: "followPiece"; square: number; durationMs?: number }
  | { type: "reset"; durationMs?: number };

export type FxAction =
  | {
      type: "squarePulse";
      squares: number[];
      durationMs?: number;
    }
  | {
      type: "pieceGlow";
      squares: number[];
      durationMs?: number;
    }
  | {
      type: "particles";
      particleKind: "spark" | "burst" | "promotion" | "warning" | "trail";
      square?: number;
      from?: number;
      to?: number;
      durationMs?: number;
    }
  | {
      type: "screenFx";
      effect: "shake" | "flash" | "success";
      durationMs?: number;
    }
  | {
      type: "soundCue";
      soundId: string;
      volume?: number;
    };

export type UiAction =
  | { type: "showHint"; text: LocalizedText }
  | {
      type: "showBanner";
      text: LocalizedText;
      style?: "info" | "warning" | "success" | "error";
    }
  | {
      type: "toggleHud";
      visible: boolean;
    };
