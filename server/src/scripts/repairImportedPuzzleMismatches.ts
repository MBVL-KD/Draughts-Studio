import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BookModel } from "../models/BookModel";
import { resolveNotationLineToStructuredMovesDetailed } from "../playback/resolveNotationLineToStructuredMoves";
import { getStepAppId } from "../utils/idResolvers";

type AuthoringExpectedMoveLike = {
  from?: number;
  to?: number;
  path?: number[];
  captures?: number[];
};

function parseFlags() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  return { write };
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
  return {
    from: m.from,
    to: m.to,
    path: m.path,
    captures: m.captures,
  };
}

async function run() {
  const { write } = parseFlags();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");

  await connectMongo(uri);
  try {
    const books = await BookModel.find({ isDeleted: false }).lean();
    let scannedBooks = 0;
    let changedBooks = 0;
    let repairedMoments = 0;
    let unresolvedMoments = 0;

    for (const book of books) {
      scannedBooks += 1;
      let bookChanged = false;
      const nextBook = structuredClone(book) as Record<string, unknown>;
      const lessons = Array.isArray(nextBook.lessons) ? (nextBook.lessons as Record<string, unknown>[]) : [];

      for (const lesson of lessons) {
        const authoring = lesson.authoringV2 as
          | {
              stepsById?: Record<string, { initialState?: { fen?: string }; timeline?: unknown[] }>;
              authoringLesson?: { stepIds?: string[] };
            }
          | undefined;
        if (!authoring?.stepsById) continue;
        const stepIds = Array.isArray(authoring.authoringLesson?.stepIds)
          ? authoring.authoringLesson!.stepIds!
          : Object.keys(authoring.stepsById);

        for (const stepId of stepIds) {
          const aStep = authoring.stepsById[stepId];
          if (!aStep?.timeline || !Array.isArray(aStep.timeline)) continue;
          const startFen = String(aStep.initialState?.fen ?? "").trim();
          if (!startFen) continue;

          for (let i = 0; i < aStep.timeline.length; i += 1) {
            const moment = aStep.timeline[i] as
              | {
                  type?: string;
                  interaction?: { kind?: string; expectedSequence?: AuthoringExpectedMoveLike[] };
                }
              | undefined;
            if (
              !moment ||
              moment.type !== "askSequence" ||
              moment.interaction?.kind !== "askSequence" ||
              !Array.isArray(moment.interaction.expectedSequence) ||
              moment.interaction.expectedSequence.length === 0
            ) {
              continue;
            }

            const notations = moment.interaction.expectedSequence
              .map((s) => toNotationFromExpected(s))
              .filter(Boolean);
            if (!notations.length) continue;

            const resolved = resolveNotationLineToStructuredMovesDetailed(startFen, notations);
            if (!resolved.ok || resolved.moves.length !== notations.length) {
              unresolvedMoments += 1;
              continue;
            }

            const nextExpected = resolved.moves.map((m) => toRuntimeExpected(m));
            const prevJson = JSON.stringify(moment.interaction.expectedSequence);
            const nextJson = JSON.stringify(nextExpected);
            if (prevJson === nextJson) continue;

            moment.interaction.expectedSequence = nextExpected;
            repairedMoments += 1;
            bookChanged = true;

            // Keep legacy step validation notations aligned if present.
            const legacyLessons = Array.isArray(nextBook.lessons)
              ? (nextBook.lessons as Record<string, unknown>[])
              : [];
            for (const ll of legacyLessons) {
              const legacySteps = Array.isArray(ll.steps) ? (ll.steps as Record<string, unknown>[]) : [];
              const legacy = legacySteps.find((s) => getStepAppId(s as { id?: string; stepId?: string }) === stepId);
              if (!legacy) continue;
              const validation = (legacy.validation ?? {}) as Record<string, unknown>;
              if (validation.type === "sequence") {
                validation.moves = resolved.moves.map((m) => m.notation);
                legacy.validation = validation;
              }
            }
          }
        }
      }

      if (bookChanged) {
        changedBooks += 1;
        if (write) {
          const payload = { ...nextBook } as Record<string, unknown>;
          delete payload._id;
          await BookModel.updateOne({ _id: (book as { _id: unknown })._id }, { $set: payload });
        }
      }
    }

    console.log("[repair-imported-puzzles] summary", {
      mode: write ? "write" : "dry-run",
      scannedBooks,
      changedBooks,
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

