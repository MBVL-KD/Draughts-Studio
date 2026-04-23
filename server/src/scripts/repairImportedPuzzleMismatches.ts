import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { StepModel } from "../models/StepModel";
import { resolveNotationLineToStructuredMovesDetailed } from "../playback/resolveNotationLineToStructuredMoves";

type AuthoringExpectedMoveLike = {
  from?: number;
  to?: number;
  path?: number[];
  captures?: number[];
};

function parseFlags() {
  const args = process.argv.slice(2);
  return { write: args.includes("--write") };
}

function toNotationFromExpected(spec: AuthoringExpectedMoveLike): string {
  const from = Number(spec.from);
  const to = Number(spec.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
  if (Array.isArray(spec.path) && spec.path.length >= 2) {
    const sep = Array.isArray(spec.captures) && spec.captures.length > 0 ? "x" : "-";
    return spec.path.join(sep);
  }
  return `${from}-${to}`;
}

function toRuntimeExpected(m: {
  from: number;
  to: number;
  path: number[];
  captures: number[];
}): AuthoringExpectedMoveLike {
  return { from: m.from, to: m.to, path: m.path, captures: m.captures };
}

async function run() {
  const { write } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");

  await connectMongo(uri);
  try {
    const steps = await StepModel.find({ isDeleted: false }).lean();
    let scannedSteps = 0;
    let changedSteps = 0;
    let repairedMoments = 0;
    let unresolvedMoments = 0;

    for (const rawStep of steps) {
      scannedSteps += 1;
      const step = rawStep as Record<string, unknown>;
      const timeline = Array.isArray(step.timeline)
        ? (step.timeline as Record<string, unknown>[])
        : [];
      const startFen = String(
        (step.initialState as Record<string, unknown> | undefined)?.fen ?? ""
      ).trim();
      if (!startFen) continue;

      let stepChanged = false;
      const nextTimeline = timeline.map((moment) => {
        if (
          !moment ||
          moment.type !== "askSequence" ||
          (moment.interaction as Record<string, unknown> | undefined)?.kind !== "askSequence" ||
          !Array.isArray(
            (moment.interaction as Record<string, unknown> | undefined)?.expectedSequence
          ) ||
          (
            (moment.interaction as Record<string, unknown>).expectedSequence as unknown[]
          ).length === 0
        ) {
          return moment;
        }

        const interaction = moment.interaction as Record<string, unknown>;
        const expected = interaction.expectedSequence as AuthoringExpectedMoveLike[];
        const notations = expected.map((s) => toNotationFromExpected(s)).filter(Boolean);
        if (!notations.length) return moment;

        const resolved = resolveNotationLineToStructuredMovesDetailed(startFen, notations);
        if (!resolved.ok || resolved.moves.length !== notations.length) {
          unresolvedMoments += 1;
          return moment;
        }

        const nextExpected = resolved.moves.map((m) => toRuntimeExpected(m));
        if (JSON.stringify(expected) === JSON.stringify(nextExpected)) return moment;

        repairedMoments += 1;
        stepChanged = true;
        return {
          ...moment,
          interaction: { ...interaction, expectedSequence: nextExpected },
        };
      });

      if (stepChanged) {
        changedSteps += 1;
        if (write) {
          await StepModel.updateOne(
            { _id: (rawStep as { _id: unknown })._id },
            { $set: { timeline: nextTimeline } }
          );
        }
      }
    }

    console.log("[repair-imported-puzzles] summary", {
      mode: write ? "write" : "dry-run",
      scannedSteps,
      changedSteps,
      repairedMoments,
      unresolvedMoments,
    });
  } finally {
    await disconnectMongo();
  }
}

run().catch((error) => {
  console.error(
    `[repair-imported-puzzles] fatal error=${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
