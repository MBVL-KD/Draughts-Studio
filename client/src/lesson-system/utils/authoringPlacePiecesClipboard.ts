import type { PlacePiecesExpectedSlot } from "../types/authoring/interactionTypes";
import { normalizeExpectedPlacement } from "./placementHelpers";

/** Bundel 14b: normalize internal clip for paste (dedupe squares, valid pieces only). */
export function normalizePlacePiecesClip(
  clip: ReadonlyArray<PlacePiecesExpectedSlot> | null | undefined
): PlacePiecesExpectedSlot[] {
  return normalizeExpectedPlacement(clip ?? []);
}
