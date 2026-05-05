import express from "express";
import multer from "multer";
import {
  analyzePdf,
  importPdfDiagrams,
  analyzeStructuredPdf,
  importStructuredBook,
  importChatGptJson,
  importChatGptBookJson,
  enrichDiagramsWithContext,
  analyzePdfWithGpt,
  type StructuredBook,
  type ChatGptJsonInput,
  type EnrichPageInput,
} from "../services/pdfAnalyzeService";
import { ValidationError } from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";

type Req = express.Request;
type Res = express.Response;

// Store PDF in memory (max 32 MB — Claude's PDF limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted"));
    }
  },
});

export const pdfAnalyzeRouter = express.Router();

pdfAnalyzeRouter.post(
  "/upload",
  upload.single("pdf"),
  async (req: Req, res: Res) => {
    if (!req.file) {
      throw new ValidationError("No PDF file provided", [
        {
          path: "pdf",
          code: "request.file.missing",
          message: "A PDF file is required",
          severity: "error",
        },
      ]);
    }

    const result = await analyzePdf(req.file.buffer, req.file.originalname);
    res.json(result);
  }
);

pdfAnalyzeRouter.post("/import", async (req: Req, res: Res) => {
  const owner = getOwnerContext(req);

  const { lessonId, items, scanEnabled, scanDepth, scanMultiPv } = req.body as {
    lessonId?: unknown;
    items?: unknown;
    scanEnabled?: unknown;
    scanDepth?: unknown;
    scanMultiPv?: unknown;
  };

  if (typeof lessonId !== "string" || !lessonId.trim()) {
    throw new ValidationError("Invalid request body", [
      { path: "lessonId", code: "required", message: "lessonId is required", severity: "error" },
    ]);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError("Invalid request body", [
      { path: "items", code: "required", message: "items must be a non-empty array", severity: "error" },
    ]);
  }

  const parsed = items
    .filter((it) => typeof it === "object" && it !== null && typeof (it as Record<string, unknown>).fen === "string")
    .map((it) => {
      const item = it as Record<string, unknown>;
      return {
        fen: String(item.fen),
        notes: typeof item.notes === "string" ? item.notes : "",
        sideToMove: item.sideToMove === "B" ? "B" : ("W" as "W" | "B"),
      };
    });

  if (parsed.length === 0) {
    throw new ValidationError("Invalid request body", [
      { path: "items", code: "invalid", message: "No valid items with fen field", severity: "error" },
    ]);
  }

  const scanConfig = {
    enabled: scanEnabled === true || scanEnabled === "true",
    depth: typeof scanDepth === "number" ? scanDepth : typeof scanDepth === "string" ? Number(scanDepth) || 10 : 10,
    multiPv: typeof scanMultiPv === "number" ? scanMultiPv : 1,
  };

  const result = await importPdfDiagrams(owner, lessonId.trim(), parsed, scanConfig);
  res.json(result);
});

// Analyze full structure: book → lessons → steps (preview, no DB writes)
pdfAnalyzeRouter.post(
  "/analyze-structure",
  upload.single("pdf"),
  async (req: Req, res: Res) => {
    if (!req.file) {
      throw new ValidationError("No PDF file provided", [
        { path: "pdf", code: "request.file.missing", message: "A PDF file is required", severity: "error" },
      ]);
    }
    const result = await analyzeStructuredPdf(req.file.buffer, req.file.originalname);
    res.json(result);
  }
);

// Enrich JSON diagrams with PDF context per page (type / question / options + thumbnails)
pdfAnalyzeRouter.post(
  "/enrich-json-context",
  upload.single("pdf"),
  async (req: Req, res: Res) => {
    if (!req.file) {
      throw new ValidationError("No PDF file provided", [
        { path: "pdf", code: "request.file.missing", message: "A PDF file is required", severity: "error" },
      ]);
    }
    const pagesJsonStr = typeof req.body.pagesJson === "string" ? req.body.pagesJson : "";
    if (!pagesJsonStr) {
      throw new ValidationError("pagesJson is required", [
        { path: "pagesJson", code: "required", message: "pagesJson is required", severity: "error" },
      ]);
    }
    let pageInputs: EnrichPageInput[];
    try {
      pageInputs = JSON.parse(pagesJsonStr) as EnrichPageInput[];
    } catch {
      throw new ValidationError("Invalid pagesJson", [
        { path: "pagesJson", code: "invalid", message: "pagesJson must be valid JSON", severity: "error" },
      ]);
    }
    const result = await enrichDiagramsWithContext(req.file.buffer, pageInputs);
    res.json(result);
  }
);

// Analyze PDF pages with GPT-4 Vision → diagrams with FEN + type + question + options
pdfAnalyzeRouter.post(
  "/analyze-with-gpt",
  upload.single("pdf"),
  async (req: Req, res: Res) => {
    if (!req.file) {
      throw new ValidationError("No PDF file provided", [
        { path: "pdf", code: "request.file.missing", message: "A PDF file is required", severity: "error" },
      ]);
    }
    const pageStart = parseInt(String(req.body.pageStart || "1"), 10) || 1;
    const pageEnd = parseInt(String(req.body.pageEnd || "-1"), 10);
    const result = await analyzePdfWithGpt(req.file.buffer, pageStart, pageEnd);
    res.json(result);
  }
);

// Import ChatGPT JSON: diagrams with type/question/options → steps in an existing lesson
pdfAnalyzeRouter.post("/import-chatgpt-json", async (req: Req, res: Res) => {
  const owner = getOwnerContext(req);
  const body = req.body as { lessonId?: unknown; input?: unknown; scanDepth?: unknown };

  if (typeof body.lessonId !== "string" || !body.lessonId.trim()) {
    throw new ValidationError("Invalid request body", [
      { path: "lessonId", code: "required", message: "lessonId is required", severity: "error" },
    ]);
  }

  const input = body.input as ChatGptJsonInput | undefined;
  if (!input || !Array.isArray(input.diagrams) || input.diagrams.length === 0) {
    throw new ValidationError("Invalid request body", [
      { path: "input.diagrams", code: "required", message: "diagrams must be a non-empty array", severity: "error" },
    ]);
  }

  const scanDepth = typeof body.scanDepth === "number" ? body.scanDepth : 10;
  const result = await importChatGptJson(owner, body.lessonId.trim(), input, scanDepth);
  res.json(result);
});

// Import ChatGPT book JSON: group by page or explicit lessonGroups → new book + lessons + steps
pdfAnalyzeRouter.post("/import-chatgpt-book", async (req: Req, res: Res) => {
  const owner = getOwnerContext(req);
  const body = req.body as { input?: unknown; scanEnabled?: unknown; scanDepth?: unknown; scanMultiPv?: unknown; lessonGroups?: unknown };

  const input = body.input as ChatGptJsonInput | undefined;
  if (!input || !Array.isArray(input.diagrams) || input.diagrams.length === 0) {
    throw new ValidationError("Invalid request body", [
      { path: "input.diagrams", code: "required", message: "diagrams must be a non-empty array", severity: "error" },
    ]);
  }

  const scanConfig = {
    enabled: body.scanEnabled !== false,
    depth: typeof body.scanDepth === "number" ? body.scanDepth : 10,
    multiPv: typeof body.scanMultiPv === "number" ? body.scanMultiPv : 1,
  };

  const lessonGroups = Array.isArray(body.lessonGroups)
    ? (body.lessonGroups as Array<{ lessonTitle: string; globalIndices: number[] }>)
    : undefined;

  const result = await importChatGptBookJson(owner, input, scanConfig, lessonGroups);
  res.json(result);
});

// Import full structure: create book + lessons + steps in DB
pdfAnalyzeRouter.post("/import-full", async (req: Req, res: Res) => {
  const owner = getOwnerContext(req);
  const body = req.body as { structure?: unknown; scanEnabled?: unknown; scanDepth?: unknown; scanMultiPv?: unknown };

  if (!body.structure || typeof body.structure !== "object") {
    throw new ValidationError("Invalid request body", [
      { path: "structure", code: "required", message: "structure is required", severity: "error" },
    ]);
  }

  const structure = body.structure as StructuredBook & { bookTitle: string };
  if (!structure.bookTitle || !Array.isArray(structure.lessons)) {
    throw new ValidationError("Invalid structure", [
      { path: "structure", code: "invalid", message: "bookTitle and lessons are required", severity: "error" },
    ]);
  }

  const scanConfig = {
    enabled: body.scanEnabled === true || body.scanEnabled === "true",
    depth: typeof body.scanDepth === "number" ? body.scanDepth : 10,
    multiPv: typeof body.scanMultiPv === "number" ? body.scanMultiPv : 1,
  };

  const result = await importStructuredBook(owner, structure, scanConfig);
  res.json(result);
});
