import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import type { StepMoment } from "../types/authoring/timelineTypes";
import { createMoment } from "./timelineMomentFactories";
import { recordedMovesToExpectedSequenceSpecs } from "./recordedMovesToExpectedSequence";

/**
 * New `askMove` moment: first recorded ply becomes the single expected move (`anyExpected`).
 */
export function buildAskMoveMomentFromRecordingFirstPly(moves: RecordedMove[]): StepMoment | null {
  if (moves.length === 0) return null;
  const base = createMoment("askMove");
  if (base.interaction?.kind !== "askMove") return base;
  const [spec] = recordedMovesToExpectedSequenceSpecs([moves[0]!]);
  if (!spec) return base;
  return {
    ...base,
    interaction: {
      ...base.interaction,
      expectedMoves: [spec],
      successPolicy: "exactOne",
      maxAttempts: 1,
      allowRetry: false,
    },
  };
}

/** New `askSequence` moment: full recorder line as `expectedSequence`. */
export function buildAskSequenceMomentFromRecording(moves: RecordedMove[]): StepMoment | null {
  if (moves.length === 0) return null;
  const specs = recordedMovesToExpectedSequenceSpecs(moves);
  const base = createMoment("askSequence");
  if (base.interaction?.kind !== "askSequence") return base;
  return {
    ...base,
    interaction: {
      ...base.interaction,
      expectedSequence: specs,
    },
  };
}
