const express = require("express");
const cors = require("cors");

const puzzleRoutes = require("./routes/puzzleRoutes");
const authContextMiddleware = require("./middleware/authContext");
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "Node",
    target: "ES2020",
    esModuleInterop: true,
    ignoreDeprecations: "6.0",
  },
});
const { registerApiRoutes } = require("./routes/index.ts");

const app = express();

app.use(cors());
// Imported books can be large (hundreds of steps); raise JSON limit for save payloads.
app.use(express.json({ limit: "10mb" }));
app.use(authContextMiddleware);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/puzzles", puzzleRoutes);
registerApiRoutes(app);

module.exports = app;