const mongoose = require("mongoose");

const ChoiceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const SolutionMoveSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    parentId: { type: String, default: null },
    variationOf: { type: String, default: null },

    from: { type: Number, required: true },
    path: { type: [Number], required: true, default: [] },
    to: { type: Number, required: true },
    captures: { type: [Number], default: [] },
    side: { type: String, enum: ["W", "B"], required: true },
    notation: { type: String, required: true },

    comment: { type: String, default: "" },
    glyph: { type: String, default: "" },
  },
  { _id: false }
);

const SolutionSchema = new mongoose.Schema(
  {
    initialFen: { type: String, default: "" },
    moves: { type: [SolutionMoveSchema], default: [] },
  },
  { _id: false }
);

const PuzzleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    kind: {
      type: String,
      required: true,
      enum: [
        "find_combination",
        "best_move",
        "multiple_choice",
        "replay_sequence",
        "setup_position",
        "explanation",
      ],
    },

    fen: { type: String, required: true, trim: true },
    sideToMove: {
      type: String,
      required: true,
      enum: ["W", "B"],
      default: "W",
    },

    prompt: { type: String, default: "" },
    hint: { type: String, default: "" },
    explanation: { type: String, default: "" },

    solutionMoves: [{ type: String }],
    bestMove: { type: String, default: "" },

    solution: {
      type: SolutionSchema,
      default: () => ({
        initialFen: "",
        moves: [],
      }),
    },

    choices: { type: [ChoiceSchema], default: [] },

    tags: { type: [String], default: [] },
    difficulty: { type: Number, min: 1, max: 5, default: 1 },

    source: {
      book: { type: String, default: "" },
      chapter: { type: String, default: "" },
      motif: { type: String, default: "" },
    },

    examEligible: { type: Boolean, default: false },
    positionHash: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Puzzle", PuzzleSchema);
