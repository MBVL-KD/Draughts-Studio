import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import type { ExpectedMoveSpec } from "../types/authoring/interactionTypes";

/**
 * Pure: map a recorder line to `expectedSequence` specs for an `askSequence` moment.
 */
export function recordedMovesToExpectedSequenceSpecs(moves: RecordedMove[]): ExpectedMoveSpec[] {
  return moves.map((m) => ({
    from: m.from,
    to: m.to,
    ...(m.path.length > 2 ? { path: [...m.path] } : {}),
    ...(m.captures.length > 0 ? { captures: [...m.captures] } : {}),
  }));
}
