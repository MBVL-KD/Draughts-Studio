import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createCanvas } = require("canvas") as typeof import("canvas");

const execFileAsync = promisify(execFile);
import { createStep } from "../repositories/stepRepository";
import { getLessonById, appendStepIdToLesson, createLesson } from "../repositories/lessonRepository";
import { createBook, appendLessonIdToBook } from "../repositories/bookRepository";
import { ConflictError, NotFoundError } from "../utils/httpErrors";
import { runImportScanAnalysis, ImportScanTimeoutError } from "../engine/importScan/runImportScanAnalysis";
import { applyScanResultToImportedStep } from "../import/normalize/applyScanToImportedStep";

type OwnerContext = { ownerType: "user" | "school" | "org"; ownerId: string };

export type PdfDiagramResult = {
  page: number;
  diagramIndex: number;
  fen: string;
  sideToMove: "W" | "B";
  notes: string;
  confidence: "high" | "medium" | "low";
};

export type PdfAnalysisResult = {
  filename: string;
  totalPages: number;
  diagrams: PdfDiagramResult[];
  error?: string;
};

const EXTRACT_PROMPT = `You are an expert at reading international draughts (Dutch: dammen) board diagrams.

## REFERENCE BOARD

The first image is a numbered draughts board — 50 dark squares labeled 1–50.
Row labels R1 (top) through R10 (bottom) appear on the right side.

## YOUR TASK

For each diagram in the PDF, visually match each piece's position to the reference board
and report which square number it occupies. Do NOT count rows — read the label from the reference.

## OUTPUT FORMAT

[{"page":<n>,"diagram_index":<n>,"pieces":[{"sq":<1-50>,"c":"W","k":false},...],
  "side_to_move":"W","notes":"<max 80 chars>","confidence":"high|medium|low"}]

"c": "W" = white/hollow disc, "B" = black/filled disc
"k": true = king (crown/ring/marking), false = plain man
"side_to_move": "W" = wit aan zet, "B" = zwart aan zet (read from caption)
Output ONLY the JSON array, no markdown. Empty: []`;

/**
 * Generates a 500×500 PNG of a numbered international draughts board.
 * Dark squares show PDN square numbers 1–50; row labels R1–R10 on the right.
 * Claude reads these labels instead of counting rows, eliminating the
 * systematic off-by-2-rows error seen with pure visual counting.
 *
 * Layout (international draughts, white at bottom):
 *   dark square when (row + col) is ODD
 *   odd rows  → dark at EVEN columns (2,4,6,8,10), pos = col/2
 *   even rows → dark at ODD  columns (1,3,5,7,9),  pos = (col+1)/2
 *   formula: sq = (row-1)*5 + pos,  pos = left-to-right index among dark squares
 */
function generateBoardReferenceImage(): Buffer {
  const cell = 48;
  const labelW = 34;
  const w = 10 * cell + labelW;
  const h = 10 * cell;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas = createCanvas(w, h) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = canvas.getContext("2d") as any;

  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      // International draughts: dark square when (row+col) is ODD.
      // Odd rows  → dark at EVEN columns (2,4,6,8,10)
      // Even rows → dark at ODD  columns (1,3,5,7,9)
      const isDark = (row + col) % 2 === 1;
      const x = (col - 1) * cell;
      const y = (row - 1) * cell;
      ctx.fillStyle = isDark ? "#555555" : "#e8e8e8";
      ctx.fillRect(x, y, cell, cell);

      if (isDark) {
        // pos 1–5 left-to-right among dark squares in this row
        // Odd row:  dark cols 2,4,6,8,10 → pos = col / 2
        // Even row: dark cols 1,3,5,7,9  → pos = (col + 1) / 2
        const pos = row % 2 === 1 ? col / 2 : (col + 1) / 2;
        const sq = (row - 1) * 5 + pos;
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(cell * 0.38)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(sq), x + cell / 2, y + cell / 2);
      }
    }

    // Red row label on the right
    ctx.fillStyle = "#cc0000";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`R${row}`, 10 * cell + 5, (row - 1) * cell + cell / 2);
  }

  return canvas.toBuffer("image/png") as Buffer;
}

/**
 * Parses Claude's JSON response robustly:
 * 1. Tries full JSON.parse first (happy path)
 * 2. Falls back to extracting individual {...} objects via a bracket-counting scanner
 *    so a truncated array still yields all complete objects before the cut-off.
 */
function parseClaudeResponse(rawText: string): RawDiagram[] {
  // Strip markdown code fences if present
  const cleaned = rawText
    .replace(/^```[a-z]*\r?\n?/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  // Happy path: full valid JSON array
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as RawDiagram[];
  } catch {
    // fall through to recovery
  }

  // Recovery: scan for complete top-level {...} objects
  const results: RawDiagram[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const fragment = cleaned.slice(start, i + 1);
        try {
          const obj = JSON.parse(fragment);
          if (typeof obj === "object" && obj !== null && "page" in obj) {
            results.push(obj as RawDiagram);
          }
        } catch {
          // skip malformed fragment
        }
        start = -1;
      }
    }
  }

  return results;
}

export async function analyzePdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<PdfAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const client = new Anthropic({ apiKey });
  const refImage = generateBoardReferenceImage();

  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: [
        // Reference board first so Claude can use it as a lookup during PDF analysis
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: refImage.toString("base64") },
        } as Anthropic.ImageBlockParam,
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
        } as Anthropic.Base64PDFSource,
        { type: "text", text: EXTRACT_PROMPT },
      ],
    }],
  });

  const finalMsg = await stream.finalMessage();
  const rawText = finalMsg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const rawDiagrams: RawDiagram[] = parseClaudeResponse(rawText);

  if (rawDiagrams.length === 0 && rawText.length > 10 && !rawText.includes("{")) {
    return {
      filename,
      totalPages: 0,
      diagrams: [],
      error: `Claude herkende geen damstellingen. Antwoord: ${rawText.slice(0, 300)}`,
    };
  }

  const diagrams: PdfDiagramResult[] = rawDiagrams
    .filter((d) => isRawDiagram(d))
    .map((d) => {
      const sideToMove = d.side_to_move === "B" ? "B" : "W";
      const pieces = Array.isArray(d.pieces) ? (d.pieces as RawPiece[]) : [];
      return {
        page: Number(d.page),
        diagramIndex: Number(d.diagram_index ?? 1),
        fen: piecesToFen(pieces, sideToMove, d.fen),
        sideToMove,
        notes: String(d.notes ?? ""),
        confidence: normalizeConfidence(d.confidence),
      };
    });

  return { filename, totalPages: 0, diagrams };
}

type RawPiece = {
  sq?: unknown; // preferred: direct PDN square number 1-50
  c?: unknown;
  k?: unknown;
  r?: unknown;  // legacy: row 1-10 from top
  p?: unknown;  // legacy: position 1-5 from left among dark squares
};

type RawDiagram = {
  page: unknown;
  diagram_index?: unknown;
  pieces?: unknown[];
  fen?: unknown;  // legacy fallback
  side_to_move?: unknown;
  notes?: unknown;
  confidence?: unknown;
};

function isRawDiagram(d: unknown): d is RawDiagram {
  return typeof d === "object" && d !== null && "page" in d;
}

/** Build a PDN FEN string from a raw pieces array. Falls back to legacyFen if pieces is empty. */
function piecesToFen(pieces: RawPiece[], sideToMove: "W" | "B", legacyFen?: unknown): string {
  const white: string[] = [];
  const black: string[] = [];

  for (const piece of pieces) {
    let sq: number;
    if (piece.sq !== undefined && piece.sq !== null) {
      // New approach: Claude reports the square number directly from the reference board
      sq = Math.round(Number(piece.sq));
    } else {
      // Legacy fallback: row/pos format
      const row = Math.round(Number(piece.r));
      const pos = Math.round(Number(piece.p));
      if (row < 1 || row > 10 || pos < 1 || pos > 5) continue;
      sq = (row - 1) * 5 + pos;
    }
    if (sq < 1 || sq > 50) continue;
    const isKing = piece.k === true || piece.k === "true";
    const label = isKing ? `K${sq}` : String(sq);
    if (String(piece.c ?? "W").toUpperCase() === "W") white.push(label);
    else black.push(label);
  }

  if (white.length === 0 && black.length === 0 && typeof legacyFen === "string" && legacyFen) {
    return normalizeFen(legacyFen);
  }

  return `${sideToMove}:W${white.join(",")}:B${black.join(",")}`;
}

function normalizeFen(fen: string): string {
  if (!fen) return "W:W:B";
  const trimmed = fen.trim().toUpperCase();
  if (/^[WB]:W[^:]*:B[^:]*$/.test(trimmed)) return trimmed;
  return fen;
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

// ── import ────────────────────────────────────────────────────────────────────

export type PdfImportItem = {
  fen: string;
  notes: string;
  sideToMove: "W" | "B";
};

export type PdfImportResult = {
  imported: number;
  stepIds: string[];
};

const APPEND_RETRY_ATTEMPTS = 4;
const APPEND_RETRY_DELAY_MS = 120;

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ScanConfig = {
  enabled: boolean;
  depth?: number;
  multiPv?: number;
};

function buildStep(
  item: PdfImportItem,
  lessonId: string,
  bookId: string,
  orderIndex: number,
  scanEnabled = false
): Record<string, unknown> {
  const stepId = randomUUID();
  const sideToMove = item.sideToMove === "B" ? "black" : "white";

  const moments: Record<string, unknown>[] = [];

  if (item.notes) {
    moments.push({
      id: randomUUID(),
      type: "introText",
      body: { values: { en: item.notes, nl: item.notes } },
      timing: { waitForUser: true },
    });
  }

  moments.push({
    id: randomUUID(),
    type: "focusBoard",
    caption: { values: { en: "", nl: "" } },
    timing: { waitForUser: true },
  });

  // When scan is enabled, add an askSequence moment so applyScanResultToImportedStep can
  // populate expectedSequence. The sequence starts empty and is filled after the scan runs.
  if (scanEnabled) {
    moments.push({
      id: randomUUID(),
      type: "askSequence",
      body: { values: { en: "Find the best move", nl: "Vind de beste zet" } },
      interaction: {
        kind: "askSequence",
        requireExactOrder: true,
        allowRetry: true,
        maxAttempts: 1,
        expectedSequence: [],
        hintPlan: [
          { type: "path_pulse_stepwise", afterFailedAttempts: 1 },
          { type: "from", afterFailedAttempts: 2 },
          { type: "path_numbers", afterFailedAttempts: 3 },
          { type: "to", afterFailedAttempts: 4 },
          { type: "captures", afterFailedAttempts: 5 },
        ],
      },
    });
  }

  return {
    id: stepId,
    stepId,
    lessonId,
    bookId,
    kind: scanEnabled ? "trySequence" : "explain",
    orderIndex,
    title: { values: { en: item.notes || `Position p.${orderIndex + 1}`, nl: item.notes || `Stelling p.${orderIndex + 1}` } },
    initialState: {
      fen: item.fen,
      sideToMove,
      variantId: "international",
      orientation: "whiteBottom",
    },
    tags: ["pdf-import"],
    timeline: moments,
  };
}

async function applyScanToStep(
  step: Record<string, unknown>,
  scanConfig: ScanConfig
): Promise<Record<string, unknown>> {
  if (!scanConfig.enabled) return step;

  const fen = String((step.initialState as Record<string, unknown>)?.fen ?? "");
  if (!fen) return step;

  try {
    const scan = await runImportScanAnalysis({
      variantId: "international",
      fen,
      depth: scanConfig.depth ?? 10,
      multiPv: scanConfig.multiPv ?? 1,
    });
    return applyScanResultToImportedStep(step, scan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pdf-import] scan skipped for fen ${fen.slice(0, 48)}: ${msg.slice(0, 80)}`);
    return step;
  }
}

export async function importPdfDiagrams(
  owner: OwnerContext,
  lessonId: string,
  items: PdfImportItem[],
  scanConfig: ScanConfig = { enabled: false }
): Promise<PdfImportResult> {
  const lesson = await getLessonById(owner, lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  const bookId = String((lesson as Record<string, unknown>).bookId ?? "");
  const currentStepCount = Array.isArray((lesson as Record<string, unknown>).stepIds)
    ? ((lesson as Record<string, unknown>).stepIds as unknown[]).length
    : 0;

  let lessonRevision = Number((lesson as Record<string, unknown>).revision ?? 1);
  const stepIds: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const orderIndex = currentStepCount + i;
    let step = buildStep(item, lessonId, bookId, orderIndex, scanConfig.enabled);
    step = await applyScanToStep(step, scanConfig);
    const stepId = String(step.stepId);

    await createStep(owner, step);

    for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await appendStepIdToLesson(owner, lessonId, stepId, lessonRevision);
        lessonRevision++;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
        await waitMs(APPEND_RETRY_DELAY_MS * attempt);
        // Re-fetch current revision after conflict
        const fresh = await getLessonById(owner, lessonId);
        lessonRevision = Number((fresh as Record<string, unknown>)?.revision ?? lessonRevision);
      }
    }

    stepIds.push(stepId);
  }

  return { imported: stepIds.length, stepIds };
}

// ── structured full-book extraction ──────────────────────────────────────────

export type StructuredStep = {
  page: number;
  diagramIndex: number;
  fen: string;
  sideToMove: "W" | "B";
  notes: string;
  confidence: "high" | "medium" | "low";
};

export type StructuredLesson = {
  title: string;
  steps: StructuredStep[];
};

export type StructuredBook = {
  bookTitle: string;
  lessons: StructuredLesson[];
  totalSteps: number;
};

const STRUCTURED_PROMPT = `You are an expert at reading international draughts (Dutch: dammen) workbooks.

## REFERENCE BOARD

The first image is a numbered draughts board — 50 dark squares labeled 1–50.
Row labels R1 (top) through R10 (bottom) appear on the right side.

## YOUR TASK

For each diagram in the PDF, visually match each piece's position to the reference board
and report which square number it occupies. Do NOT count rows — read the label from the reference.

## LESSON STRUCTURE

Identify chapters/lessons from headings (Les 1, Hoofdstuk 2, Opgave, etc.).
Group exercises under their nearest heading. Keep Dutch titles as-is.

## OUTPUT FORMAT

ONE compact JSON object (no markdown, no whitespace):
{"book_title":"<title>","lessons":[{"title":"<title>","steps":[{"p":<page>,"di":<diagram_index>,"pieces":[{"sq":<1-50>,"c":"W","k":false}],"s":"W","n":"<notes max 60 chars>","c":"h|m|l"}]}]}

"c" for piece: "W"=white/hollow, "B"=black/filled
"k": true=king (crown), false=man
"s": "W"=wit aan zet, "B"=zwart aan zet
"c" for step: h=high, m=medium, l=low confidence
Output ONLY the JSON, nothing else.`;

type RawStructuredStep = {
  p?: unknown;
  di?: unknown;
  pieces?: unknown[];  // each piece has {sq, c, k} or legacy {r, p, c, k}
  f?: unknown;         // legacy FEN fallback
  s?: unknown;
  n?: unknown;
  c?: unknown;
};

type RawStructuredLesson = {
  title?: unknown;
  steps?: unknown[];
};

type RawStructuredBook = {
  book_title?: unknown;
  lessons?: unknown[];
};

function parseStructuredResponse(rawText: string): RawStructuredBook | null {
  const cleaned = rawText
    .replace(/^```[a-z]*\r?\n?/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  // Happy path: complete valid JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null && "lessons" in parsed) {
      return parsed as RawStructuredBook;
    }
  } catch { /* fall through */ }

  // Recovery path: extract book_title + as many complete lesson objects as possible.
  // This handles truncated responses where the outer {} is never closed.
  const titleMatch = cleaned.match(/"book_title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const bookTitle = titleMatch ? titleMatch[1] : undefined;

  const lessons: RawStructuredLesson[] = [];
  // Scan for top-level lesson objects inside the "lessons" array
  const lessonsStart = cleaned.indexOf('"lessons"');
  if (lessonsStart === -1) return null;

  let depth = 0;
  let objStart = -1;
  for (let i = lessonsStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const fragment = cleaned.slice(objStart, i + 1);
        try {
          const obj = JSON.parse(fragment);
          if (typeof obj === "object" && obj !== null && "steps" in obj) {
            lessons.push(obj as RawStructuredLesson);
          }
        } catch { /* skip malformed lesson */ }
        objStart = -1;
      }
    }
  }

  if (lessons.length > 0) {
    return { book_title: bookTitle, lessons };
  }

  return null;
}

function normalizeStructuredStep(raw: RawStructuredStep): StructuredStep {
  const conf = raw.c === "h" ? "high" : raw.c === "l" ? "low" : "medium";
  const sideToMove = String(raw.s ?? "W").toUpperCase() === "B" ? "B" : "W";
  const pieces = Array.isArray(raw.pieces) ? (raw.pieces as RawPiece[]) : [];
  return {
    page: Number(raw.p ?? 0),
    diagramIndex: Number(raw.di ?? 1),
    fen: piecesToFen(pieces, sideToMove, raw.f),
    sideToMove,
    notes: String(raw.n ?? "").slice(0, 80),
    confidence: conf,
  };
}

export async function analyzeStructuredPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<StructuredBook & { filename: string; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const refImage = generateBoardReferenceImage();

  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 32000,
    messages: [{
      role: "user",
      content: [
        // Reference board first so Claude can look up square numbers during analysis
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: refImage.toString("base64") },
        } as Anthropic.ImageBlockParam,
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
        } as Anthropic.Base64PDFSource,
        { type: "text", text: STRUCTURED_PROMPT },
      ],
    }],
  });

  const finalMsg = await stream.finalMessage();
  const rawText = finalMsg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const raw = parseStructuredResponse(rawText);

  if (!raw) {
    return {
      filename, bookTitle: filename.replace(/\.pdf$/i, ""),
      lessons: [], totalSteps: 0,
      error: `Kon structuur niet parsen. Begin van antwoord: ${rawText.slice(0, 300)}`,
    };
  }

  const lessons: StructuredLesson[] = (Array.isArray(raw.lessons) ? raw.lessons : [])
    .filter((l): l is RawStructuredLesson => typeof l === "object" && l !== null)
    .map((l) => ({
      title: String(l.title ?? "Les"),
      steps: (Array.isArray(l.steps) ? l.steps : [])
        .filter((s): s is RawStructuredStep => typeof s === "object" && s !== null)
        .map(normalizeStructuredStep),
    }))
    .filter((l) => l.steps.length > 0);

  const totalSteps = lessons.reduce((sum, l) => sum + l.steps.length, 0);

  return {
    filename,
    bookTitle: String(raw.book_title ?? filename.replace(/\.pdf$/i, "")),
    lessons,
    totalSteps,
  };
}

// ── GPT vision analysis pipeline ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadImage } = require("canvas") as typeof import("canvas");
import OpenAI from "openai";

// ── render PDF page ───────────────────────────────────────────────────────────

async function renderPdfPage(
  pdfPath: string,
  pageNum: number,
  scale = 2.0,
): Promise<{ pngBuffer: Buffer; totalPages: number }> {
  const renderScript = join(__dirname, "../scripts/renderPdfPage.py");
  const tmpPng = join(tmpdir(), `draughts_${randomUUID()}_p${pageNum}.png`);
  try {
    const { stderr } = await execFileAsync("python3", [renderScript, pdfPath, String(pageNum), tmpPng, String(scale)]);
    const match = String(stderr).match(/PDF pages:\s*(\d+)/);
    const totalPages = match ? parseInt(match[1], 10) : 1;
    const pngBuffer = readFileSync(tmpPng);
    return { pngBuffer, totalPages };
  } finally {
    try { unlinkSync(tmpPng); } catch { /* ignore */ }
  }
}

// ── board detection (ported from testPdfFen.ts) ───────────────────────────────

type PageBoard = { x: number; y: number; size: number; score: number };

function getBrightnessPx(pixels: Uint8ClampedArray, W: number, x: number, y: number): number {
  const i = (y * W + x) * 4;
  return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
}

function detectBoardsOnPage(pixels: Uint8ClampedArray, W: number, H: number): PageBoard[] {
  const G = 60;
  const grid: number[][] = [];
  for (let gy = 0; gy < G; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < G; gx++) {
      const px = Math.round((gx + 0.5) / G * W);
      const py = Math.round((gy + 0.5) / G * H);
      grid[gy][gx] = getBrightnessPx(pixels, W, px, py);
    }
  }

  const candidates: PageBoard[] = [];
  for (let gs = Math.round(G * 0.12); gs <= Math.round(G * 0.95); gs++) {
    for (let gy0 = 0; gy0 + gs <= G; gy0++) {
      for (let gx0 = 0; gx0 + gs <= G; gx0++) {
        const step = gs / 10;
        let score = 0;
        for (let row = 0; row < 10; row++) {
          for (let col = 0; col < 10; col++) {
            const gx = gx0 + (col + 0.5) * step;
            const gy = gy0 + (row + 0.5) * step;
            const b  = grid[Math.round(gy)]?.[Math.round(gx)] ?? 128;
            const bR = grid[Math.round(gy)]?.[Math.round(gx0 + (col + 1.5) * step)] ?? 128;
            const bD = grid[Math.round(gy0 + (row + 1.5) * step)]?.[Math.round(gx)] ?? 128;
            score += Math.abs(b - bR) + Math.abs(b - bD);
          }
        }
        candidates.push({ x: (gx0 / G) * W, y: (gy0 / G) * H, size: (gs / G) * Math.min(W, H), score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const threshold = (candidates[0]?.score ?? 0) * 0.65;
  const selected: PageBoard[] = [];
  for (const c of candidates) {
    if (c.score < threshold) break;
    const overlaps = selected.some((s) => {
      const ox = Math.max(0, Math.min(c.x + c.size, s.x + s.size) - Math.max(c.x, s.x));
      const oy = Math.max(0, Math.min(c.y + c.size, s.y + s.size) - Math.max(c.y, s.y));
      return ox * oy > Math.min(c.size, s.size) ** 2 * 0.18;
    });
    if (!overlaps) selected.push(c);
    if (selected.length >= 8) break;
  }
  return selected;
}

// ── crop board + surrounding context ─────────────────────────────────────────

async function cropBoardWithContext(
  pngBuffer: Buffer,
  board: PageBoard,
  W: number,
  H: number,
): Promise<Buffer> {
  // Generous padding: above=40% (for question text), sides=20%, below=20%
  const padTop    = board.size * 0.40;
  const padSide   = board.size * 0.20;
  const padBottom = board.size * 0.20;

  const sx = Math.max(0, board.x - padSide);
  const sy = Math.max(0, board.y - padTop);
  const ex = Math.min(W, board.x + board.size + padSide);
  const ey = Math.min(H, board.y + board.size + padBottom);
  const sw = ex - sx;
  const sh = ey - sy;

  const img = await loadImage(pngBuffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crop = createCanvas(Math.round(sw), Math.round(sh)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cctx = crop.getContext("2d") as any;
  cctx.fillStyle = "#fff";
  cctx.fillRect(0, 0, Math.round(sw), Math.round(sh));
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, Math.round(sw), Math.round(sh));
  return crop.toBuffer("image/png") as Buffer;
}

async function cropBoardOnly(
  pngBuffer: Buffer,
  board: PageBoard,
  W: number,
  H: number,
): Promise<Buffer> {
  const margin = Math.max(2, Math.round(board.size * 0.015));
  const sx = Math.max(0, Math.floor(board.x + margin));
  const sy = Math.max(0, Math.floor(board.y + margin));
  const ex = Math.min(W, Math.ceil(board.x + board.size - margin));
  const ey = Math.min(H, Math.ceil(board.y + board.size - margin));
  const sw = Math.max(10, ex - sx);
  const sh = Math.max(10, ey - sy);

  const img = await loadImage(pngBuffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crop = createCanvas(sw, sh) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cctx = crop.getContext("2d") as any;
  cctx.fillStyle = "#fff";
  cctx.fillRect(0, 0, sw, sh);
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop.toBuffer("image/png") as Buffer;
}

// ── pixel-based piece detection ───────────────────────────────────────────────

function sampleCircle(
  pixels: Uint8ClampedArray, W: number, H: number,
  cx: number, cy: number, r: number,
): number {
  let sum = 0, count = 0;
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x >= 0 && x < W && y >= 0 && y < H) {
        sum += getBrightnessPx(pixels, W, x, y);
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 128;
}

function alignBoard(
  pixels: Uint8ClampedArray, W: number, H: number, board: PageBoard,
): { aligned: PageBoard; contrast: number } {
  const cell = board.size / 10;
  const r = cell * 0.18;

  const measureContrast = (dx: number, dy: number): number => {
    let darkSum = 0, lightSum = 0, n = 0;
    for (let row = 2; row <= 9; row++) {
      for (let col = 2; col <= 9; col++) {
        const cx = board.x + dx + (col - 0.5) * cell;
        const cy = board.y + dy + (row - 0.5) * cell;
        const b = sampleCircle(pixels, W, H, cx, cy, r);
        if ((row + col) % 2 === 1) darkSum += b;
        else lightSum += b;
        n++;
      }
    }
    return (lightSum - darkSum) / (n / 2);
  };

  let bestContrast = -Infinity;
  let bestDx = 0, bestDy = 0;
  for (const dx of [0, cell]) {
    for (const dy of [0, cell]) {
      const c = measureContrast(dx, dy);
      if (c > bestContrast) { bestContrast = c; bestDx = dx; bestDy = dy; }
    }
  }
  const aligned: PageBoard = { ...board, x: board.x + bestDx, y: board.y + bestDy };
  if (bestDx !== 0 || bestDy !== 0) {
    console.log(`  [align] dx=${bestDx.toFixed(0)} dy=${bestDy.toFixed(0)} contrast=${bestContrast.toFixed(0)}`);
  }
  return { aligned, contrast: bestContrast };
}

type VisionPiece = { sq: number; c: "W" | "B"; k: boolean };

type PixelDetectResult = {
  pieces: VisionPiece[];
  contrast: number;
  quality: "high" | "low";
};

function detectPiecesPixel(pixels: Uint8ClampedArray, W: number, H: number, board: PageBoard): PixelDetectResult {
  const { aligned, contrast } = alignBoard(pixels, W, H, board);
  if (contrast < 15) {
    console.log(`  [pixel] poor contrast (${contrast.toFixed(0)}) → skipping board`);
    return { pieces: [], contrast, quality: "low" };
  }
  const cell = aligned.size / 10;
  const innerR = cell * 0.28;

  const samples: { sq: number; brightness: number }[] = [];
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      if ((row + col) % 2 !== 1) continue; // only dark squares
      const pos = row % 2 === 1 ? col / 2 : (col + 1) / 2;
      const sq = (row - 1) * 5 + pos;
      const cx = aligned.x + (col - 0.5) * cell;
      const cy = aligned.y + (row - 0.5) * cell;
      samples.push({ sq, brightness: sampleCircle(pixels, W, H, cx, cy, innerR) });
    }
  }

  // Median brightness = background (most squares are empty)
  const sorted = [...samples].sort((a, b) => a.brightness - b.brightness);
  const bg = sorted[Math.floor(sorted.length / 2)].brightness;

  const BLACK_THRESHOLD = bg - 35;
  const WHITE_THRESHOLD = bg + 30;

  const pieces: VisionPiece[] = [];
  for (const s of samples) {
    if (s.brightness < BLACK_THRESHOLD) pieces.push({ sq: s.sq, c: "B", k: false });
    else if (s.brightness > WHITE_THRESHOLD) pieces.push({ sq: s.sq, c: "W", k: false });
  }

  console.log(`  [pixel] bg=${bg.toFixed(0)} BLACK<${BLACK_THRESHOLD.toFixed(0)} WHITE>${WHITE_THRESHOLD.toFixed(0)} → ${pieces.length} pieces`);
  return { pieces, contrast, quality: "high" };
}

function visionPiecesToFen(pieces: VisionPiece[], sideToMove: "W" | "B"): string {
  const white = pieces
    .filter((p) => p.c === "W")
    .map((p) => (p.k ? `K${p.sq}` : String(p.sq)))
    .sort((a, b) => Number(String(a).replace("K", "")) - Number(String(b).replace("K", "")));
  const black = pieces
    .filter((p) => p.c === "B")
    .map((p) => (p.k ? `K${p.sq}` : String(p.sq)))
    .sort((a, b) => Number(String(a).replace("K", "")) - Number(String(b).replace("K", "")));
  return `${sideToMove}:W${white.join(",")}:B${black.join(",")}`;
}

// ── GPT context detection (type / question / options / sideToMove) ────────────

const CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sideToMove: { enum: ["W", "B"] },
    stepType:   { enum: ["askSequence", "multipleChoice", "presentation"] },
    question:   { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label:   { type: "string" },
          correct: { type: "boolean" },
        },
        required: ["label", "correct"],
      },
    },
  },
  required: ["sideToMove", "stepType", "question", "options"],
} as const;

type ContextSchema = {
  sideToMove: "W" | "B";
  stepType: "askSequence" | "multipleChoice" | "presentation";
  question: string;
  options: Array<{ label: string; correct: boolean }>;
};

const CONTEXT_PROMPT = `Dit is een uitsnede van een damborddiagram uit een Nederlands werkboek.
Negeer de stukken op het bord — kijk alleen naar de tekst rondom het bord.

Bepaal:
1. Wie aan zet is: "Wit aan zet" → W, "Zwart aan zet" → B. Standaard W als niet vermeld.
2. Type oefening:
   - "askSequence": vind de beste zet of slag (bijv. "Hoe moet wit slaan?", "Wat is de beste zet?")
   - "multipleChoice": meerkeuze antwoorden (Ja/Nee of opties A/B/C aanwezig)
   - "presentation": uitleg of voorbeeld zonder interactievraag
3. Vraagstelling: exacte tekst van de vraag, of "" als er geen is.
4. Antwoordopties: alleen bij multipleChoice, anders lege array [].`;

const BOARD_PIECES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pieces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sq: { type: "number" },
          c: { enum: ["W", "B"] },
          k: { type: "boolean" },
        },
        required: ["sq", "c", "k"],
      },
    },
    uncertainSquares: {
      type: "array",
      items: { type: "number" },
    },
    confidence: { enum: ["high", "medium", "low"] },
  },
  required: ["pieces", "uncertainSquares", "confidence"],
} as const;

type BoardPiecesResult = {
  pieces: VisionPiece[];
  uncertainSquares: number[];
  confidence: "high" | "medium" | "low";
};

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("does not exist") || msg.includes("model_not_found");
}

let cachedModelList: string[] | null = null;
let resolvedVisionModel: string | null = null;

async function getAvailableModelIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openai: any,
): Promise<string[]> {
  if (cachedModelList) return cachedModelList;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listed = await (openai.models as any).list();
    const data = Array.isArray(listed?.data) ? listed.data : [];
    cachedModelList = data
      .map((m: unknown) => (m && typeof m === "object" ? (m as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    cachedModelList = [];
  }
  return cachedModelList;
}

async function resolveBestVisionModel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openai: any,
  preferredModel: string,
): Promise<string> {
  if (resolvedVisionModel) return resolvedVisionModel;
  const available = await getAvailableModelIds(openai);
  const candidates = [
    preferredModel,
    process.env.OPENAI_VISION_MODEL,
    process.env.OPENAI_FALLBACK_MODEL,
    process.env.OPENAI_MODEL,
    "gpt-5.5-thinking",
    "gpt-5.4-auto-thinking",
    "gpt-5.3",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  if (available.length > 0) {
    const selected = candidates.find((c) => available.includes(c));
    resolvedVisionModel = selected ?? candidates[candidates.length - 1];
  } else {
    resolvedVisionModel = candidates[0];
  }
  console.log(`[hybrid] resolved vision model: ${resolvedVisionModel}`);
  return resolvedVisionModel;
}

async function createResponseWithModelFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openai: any,
  preferredModel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
): Promise<{ response: unknown; usedModel: string }> {
  const resolvedPreferred = await resolveBestVisionModel(openai, preferredModel);
  const envModel = process.env.OPENAI_MODEL;
  const candidates = [
    resolvedPreferred,
    envModel,
    process.env.OPENAI_FALLBACK_MODEL,
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  const uniqueCandidates = [...new Set(candidates)];
  let lastErr: unknown = null;
  for (const model of uniqueCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (openai.responses as any).create({ ...payload, model });
      if (model !== resolvedPreferred) {
        console.warn(`[hybrid] model fallback: ${resolvedPreferred} -> ${model}`);
      }
      return { response, usedModel: model };
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) throw err;
    }
  }
  throw lastErr ?? new Error("No available OpenAI model for responses call");
}

async function createChatCompletionWithModelFallback(
  openai: OpenAI,
  preferredModel: string,
  args: {
    max_tokens: number;
    messages: Array<{
      role: "user";
      content: Array<
        { type: "text"; text: string } |
        { type: "image_url"; image_url: { url: string; detail: "high" | "low" | "auto" } }
      >;
    }>;
  },
) {
  const resolvedPreferred = await resolveBestVisionModel(openai, preferredModel);
  const candidates = [
    resolvedPreferred,
    process.env.OPENAI_FALLBACK_MODEL,
    process.env.OPENAI_MODEL,
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  const uniqueCandidates = [...new Set(candidates)];
  let lastErr: unknown = null;
  for (const model of uniqueCandidates) {
    try {
      const resp = await openai.chat.completions.create({
        model,
        max_tokens: args.max_tokens,
        messages: args.messages,
      });
      if (model !== resolvedPreferred) {
        console.warn(`[hybrid] chat model fallback: ${resolvedPreferred} -> ${model}`);
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) throw err;
    }
  }
  throw lastErr ?? new Error("No available OpenAI model for chat completion call");
}

function normalizeBoardPiecesResult(parsed: Record<string, unknown> | null): BoardPiecesResult {
  if (!parsed) {
    return { pieces: [], uncertainSquares: [], confidence: "low" };
  }
  const piecesRaw = Array.isArray(parsed.pieces) ? parsed.pieces : [];
  const normalizedPieces: VisionPiece[] = piecesRaw
    .map((p) => ({
      sq: Math.round(Number((p as { sq?: unknown }).sq)),
      c: (p as { c?: unknown }).c === "B" ? ("B" as const) : ("W" as const),
      k: (p as { k?: unknown }).k === true,
    }))
    .filter((p) => p.sq >= 1 && p.sq <= 50);

  const uncertainSquares = (Array.isArray(parsed.uncertainSquares) ? parsed.uncertainSquares : [])
    .map((n) => Math.round(Number(n)))
    .filter((n) => n >= 1 && n <= 50);

  const confidence =
    parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : "medium";

  return { pieces: normalizedPieces, uncertainSquares, confidence };
}

function isPlausiblePieceSet(pieces: VisionPiece[]): boolean {
  if (pieces.length === 0) return true;
  if (pieces.length > 40) return false;
  const white = pieces.filter((p) => p.c === "W").length;
  const black = pieces.filter((p) => p.c === "B").length;
  if ((white === 0 || black === 0) && pieces.length > 12) return false;
  return true;
}

async function getContextFromGpt(
  cropBuffer: Buffer,
  openai: OpenAI,
  model: string,
): Promise<ContextSchema> {
  const base64 = cropBuffer.toString("base64");

  const { response } = await createResponseWithModelFallback(openai, model, {
    temperature: 0,
    text: {
      format: {
        type: "json_schema",
        name: "draughts_context_result",
        strict: true,
        schema: CONTEXT_SCHEMA,
      },
    },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: CONTEXT_PROMPT },
        { type: "input_image", image_url: `data:image/png;base64,${base64}`, detail: "low" },
      ],
    }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: string = (response as any).output_text ?? "";
  return JSON.parse(raw) as ContextSchema;
}

async function getPiecesFromGpt(
  cropBuffer: Buffer,
  openai: OpenAI,
  model: string,
): Promise<BoardPiecesResult> {
  const base64 = cropBuffer.toString("base64");
  const prompt = `You are extracting pieces from one cropped 10x10 international draughts board.

Rules:
- Only playable dark squares 1..50 exist.
- Include a piece only when clearly centered in a square.
- Never treat borders, arrows, labels, or crop noise as pieces.
- Mark king as k=true only if visually clear stacked/double/king mark.
- If uncertain, do not include that piece; put square in uncertainSquares.

Return strict JSON only.`;

  const runOnce = async (pass: number): Promise<BoardPiecesResult | null> => {
    const passPrompt = pass > 1
      ? `${prompt}\n\nRetry pass. Be extra strict on false positives near borders and promotion rows.`
      : prompt;
    const { response } = await createResponseWithModelFallback(openai, model, {
      temperature: 0,
      max_output_tokens: 1400,
      text: {
        format: {
          type: "json_schema",
          name: "draughts_board_pieces",
          strict: true,
          schema: BOARD_PIECES_SCHEMA,
        },
      },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: passPrompt },
          { type: "input_image", image_url: `data:image/png;base64,${base64}`, detail: "high" },
        ],
      }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: string = (response as any).output_text ?? "";
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
    const normalized = normalizeBoardPiecesResult(parsed);
    if (!isPlausiblePieceSet(normalized.pieces)) return null;
    return normalized;
  };

  // Always high detail for piece extraction.
  const first = await runOnce(1);
  if (first) return first;
  const second = await runOnce(2);
  if (second) return second;
  const third = await runOnce(3);
  if (third) return third;
  throw new Error("GPT piece extraction returned invalid or implausible JSON after 3 attempts");
}

const VERIFY_PIECES_SCHEMA = BOARD_PIECES_SCHEMA;

async function verifyPiecesWithGpt(
  cropBuffer: Buffer,
  openai: OpenAI,
  model: string,
  context: ContextSchema,
  pixelPieces: VisionPiece[],
): Promise<BoardPiecesResult> {
  const base64 = cropBuffer.toString("base64");
  const prompt = `You are verifying a draughts (10x10 international) board extraction.
You are given:
1) A cropped board image
2) A detected piece list
Your job:
REMOVE incorrect pieces, DO NOT invent new ones.
Rules:
- Only keep pieces that are clearly visible in the center of a playable square
- Ignore board borders, arrows, labels, noise
- Promotion rows:
  - white men on squares 1-5 are suspicious -> remove unless clearly visible
  - black men on squares 46-50 are suspicious -> remove unless clearly visible
- Do NOT add pieces unless absolutely certain
- Side to move context: ${context.sideToMove}
Return corrected JSON.
Focus on removing false positives.`;

  const { response } = await createResponseWithModelFallback(openai, model, {
    temperature: 0,
    max_output_tokens: 1600,
    text: {
      format: {
        type: "json_schema",
        name: "draughts_verify_pieces",
        strict: true,
        schema: VERIFY_PIECES_SCHEMA,
      },
    },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_text", text: `pixelPieces=${JSON.stringify(pixelPieces)}` },
        { type: "input_image", image_url: `data:image/png;base64,${base64}`, detail: "high" },
      ],
    }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: string = (response as any).output_text ?? "";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const normalized = normalizeBoardPiecesResult(parsed);
  if (!isPlausiblePieceSet(normalized.pieces)) {
    throw new Error("Verifier returned implausible piece set");
  }
  return normalized;
}

export type GptAnalysisResult = {
  diagrams: ChatGptDiagramItem[];
  totalPages: number;
  pagesAnalyzed: number;
  diagramsFound: number;
  errors: string[];
};

export async function analyzePdfWithGpt(
  pdfBuffer: Buffer,
  pageStart = 1,
  pageEnd = -1,
): Promise<GptAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const model = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5-thinking";
  const openai = new OpenAI({ apiKey });

  const tmpPdf = join(tmpdir(), `draughts_${randomUUID()}.pdf`);
  writeFileSync(tmpPdf, pdfBuffer);

  const diagrams: ChatGptDiagramItem[] = [];
  const errors: string[] = [];
  let totalPages = 1;
  let pagesAnalyzed = 0;
  let diagramCounter = 0;

  try {
    const { pngBuffer: firstPng, totalPages: n } = await renderPdfPage(tmpPdf, pageStart);
    totalPages = n;
    const effectiveEnd = pageEnd === -1 ? totalPages : Math.min(pageEnd, totalPages);

    const analyzeOnePage = async (pageNum: number, pngBuffer: Buffer) => {
      const img = await loadImage(pngBuffer);
      const W = img.width, H = img.height;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageCanvas = createCanvas(W, H) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pctx = pageCanvas.getContext("2d") as any;
      pctx.drawImage(img, 0, 0);
      const pixels: Uint8ClampedArray = pctx.getImageData(0, 0, W, H).data;

      const boards = detectBoardsOnPage(pixels, W, H);
      console.log(`[hybrid] page ${pageNum}: ${boards.length} board(s) detected`);
      if (boards.length === 0) { pagesAnalyzed++; return; }
      let pageAccepted = 0;
      let pageSkipped = 0;

      for (let bi = 0; bi < boards.length; bi++) {
        diagramCounter++;
        const tag = `[hybrid] p${pageNum} d${diagramCounter} b${bi + 1}/${boards.length}`;
        try {
          // Step 1: deterministic pixel detection → pieces (no kings)
          const pixel = detectPiecesPixel(pixels, W, H, boards[bi]);
          console.log(`  ${tag} pixel contrast=${pixel.contrast.toFixed(1)} quality=${pixel.quality} pieces=${pixel.pieces.length}`);

          // Step 2: crop images for GPT
          const cropBuf = await cropBoardWithContext(pngBuffer, boards[bi], W, H);
          const boardOnlyBuf = await cropBoardOnly(pngBuffer, boards[bi], W, H);

          // Step 3: GPT reads only text context (cheap: detail=low)
          const context = await getContextFromGpt(cropBuf, openai, model);

          // Step 4: pixel is source of truth; GPT only verifies/removes false positives.
          let pieces: VisionPiece[] = pixel.pieces;
          let source: "verified" | "pixel-only" = "pixel-only";
          let uncertainSquares: number[] = [];
          let confidence: "high" | "medium" | "low" = pixel.quality === "high" ? "medium" : "low";
          try {
            const verified = await verifyPiecesWithGpt(
              boardOnlyBuf,
              openai,
              model,
              context,
              pixel.pieces,
            );
            pieces = verified.pieces;
            uncertainSquares = verified.uncertainSquares;
            confidence = verified.confidence;
            source = "verified";
            console.log(`  ${tag} verify ok pieces=${pieces.length} conf=${confidence} uncertain=${uncertainSquares.length}`);
          } catch (verifyErr) {
            const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
            console.warn(`  ${tag} verify failed: ${msg.slice(0, 140)}; using pixel-only`);
          }

          // Fail-safe: never emit an effectively empty board as a valid diagram.
          if (pieces.length === 0) {
            errors.push(`p${pageNum} d${diagramCounter}: no reliable pieces detected (pixel+fallback)`);
            console.warn(`  ${tag} skipped: no reliable pieces detected (pixel+gpt+verify)`);
            pageSkipped++;
            continue;
          }

          const fen = visionPiecesToFen(pieces, context.sideToMove);

          if (fen === "W:W:B" || fen === "B:W:B") {
            errors.push(`p${pageNum} d${diagramCounter}: empty fen rejected (${fen})`);
            console.warn(`  ${tag} skipped: empty fen rejected ${fen}`);
            pageSkipped++;
            continue;
          }

          const promoWarning =
            pieces.some((p) => p.c === "W" && !p.k && p.sq <= 5) ||
            pieces.some((p) => p.c === "B" && !p.k && p.sq >= 46);
          if (promoWarning) {
            console.warn(`  [hybrid] p${pageNum} d${diagramCounter}: promotion-row man detected (review advised)`);
          }

          console.log(`  ${tag} accepted fen=${fen} | type=${context.stepType} | side=${context.sideToMove} | src=${source} | conf=${confidence} | uncertain=${uncertainSquares.length}`);
          pageAccepted++;

          diagrams.push({
            diagram: diagramCounter,
            page: pageNum,
            fen,
            sideToMove: context.sideToMove,
            type: context.stepType,
            question: context.question || undefined,
            options: context.options.length > 0 ? context.options : undefined,
          });
        } catch (err) {
          errors.push(`p${pageNum} d${diagramCounter}: ${String(err)}`);
          console.warn(`  ${tag} fatal error: ${String(err).slice(0, 220)}`);
          pageSkipped++;
        }
      }
      console.log(`[hybrid] page ${pageNum} summary: accepted=${pageAccepted} skipped=${pageSkipped} total=${boards.length}`);
      pagesAnalyzed++;
    };

    await analyzeOnePage(pageStart, firstPng);

    for (let p = pageStart + 1; p <= effectiveEnd; p++) {
      try {
        const { pngBuffer } = await renderPdfPage(tmpPdf, p);
        await analyzeOnePage(p, pngBuffer);
      } catch (err) {
        errors.push(`Pagina ${p}: ${String(err)}`);
      }
    }
  } finally {
    try { unlinkSync(tmpPdf); } catch { /* ignore */ }
  }

  return { diagrams, totalPages, pagesAnalyzed, diagramsFound: diagrams.length, errors };
}

// ── ChatGPT JSON import ────────────────────────────────────────────────────────

export type ChatGptOption = {
  label: string;
  correct: boolean;
};

export type ChatGptDiagramItem = {
  diagram?: number;
  page?: number;
  fen: string;
  sideToMove?: "W" | "B";
  type?: "askSequence" | "multipleChoice" | "presentation" | "uitleg" | "explain";
  question?: string;
  options?: ChatGptOption[];
};

export type ChatGptJsonInput = {
  source?: string;
  fenFormat?: string;
  diagrams: ChatGptDiagramItem[];
};

export type ChatGptImportResult = {
  imported: number;
  stepIds: string[];
};

function buildChatGptStep(
  item: ChatGptDiagramItem,
  lessonId: string,
  bookId: string,
  orderIndex: number,
): Record<string, unknown> {
  const stepId = randomUUID();
  const sideToMove = item.sideToMove === "B" ? "black" : "white";
  const stepType = item.type ?? "presentation";
  const isAskSequence = stepType === "askSequence";
  const isMultipleChoice = stepType === "multipleChoice";
  const question = item.question ?? "";

  const moments: Record<string, unknown>[] = [];

  moments.push({
    id: randomUUID(),
    type: "focusBoard",
    caption: { values: { en: "", nl: "" } },
    timing: { waitForUser: true },
  });

  if (isAskSequence) {
    moments.push({
      id: randomUUID(),
      type: "askSequence",
      body: { values: { en: question || "Find the best move", nl: question || "Vind de beste zet" } },
      interaction: {
        kind: "askSequence",
        requireExactOrder: true,
        allowRetry: true,
        maxAttempts: 1,
        expectedSequence: [],
        hintPlan: [
          { type: "path_pulse_stepwise", afterFailedAttempts: 1 },
          { type: "from", afterFailedAttempts: 2 },
          { type: "path_numbers", afterFailedAttempts: 3 },
          { type: "to", afterFailedAttempts: 4 },
          { type: "captures", afterFailedAttempts: 5 },
        ],
      },
    });
  } else if (isMultipleChoice) {
    const options = (item.options ?? []).map((opt) => ({
      id: randomUUID(),
      label: { values: { en: opt.label, nl: opt.label } },
      isCorrect: opt.correct,
    }));
    moments.push({
      id: randomUUID(),
      type: "multipleChoice",
      body: { values: { en: question, nl: question } },
      interaction: {
        kind: "multipleChoice",
        prompt: { values: { en: question || "Kies het beste antwoord.", nl: question || "Kies het beste antwoord." } },
        options,
        allowMultiple: false,
        allowRetry: true,
        maxAttempts: 5,
      },
    });
  } else if (question) {
    // presentation / uitleg with a question text — show it as introText
    moments.unshift({
      id: randomUUID(),
      type: "introText",
      body: { values: { en: question, nl: question } },
      timing: { waitForUser: true },
    });
  }

  return {
    id: stepId,
    stepId,
    lessonId,
    bookId,
    kind: isAskSequence ? "trySequence" : "explain",
    orderIndex,
    title: {
      values: {
        en: question || `Position ${orderIndex + 1}`,
        nl: question || `Stelling ${orderIndex + 1}`,
      },
    },
    initialState: {
      fen: item.fen,
      sideToMove,
      variantId: "international",
      orientation: "whiteBottom",
    },
    tags: ["chatgpt-import"],
    timeline: moments,
  };
}

export async function importChatGptJson(
  owner: OwnerContext,
  lessonId: string,
  input: ChatGptJsonInput,
  scanDepth = 10,
): Promise<ChatGptImportResult> {
  const lesson = await getLessonById(owner, lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  const bookId = String((lesson as Record<string, unknown>).bookId ?? "");
  const currentStepCount = Array.isArray((lesson as Record<string, unknown>).stepIds)
    ? ((lesson as Record<string, unknown>).stepIds as unknown[]).length
    : 0;

  let lessonRevision = Number((lesson as Record<string, unknown>).revision ?? 1);
  const stepIds: string[] = [];

  for (let i = 0; i < input.diagrams.length; i++) {
    const item = input.diagrams[i];
    const orderIndex = currentStepCount + i;
    const isAskSequence = (item.type ?? "presentation") === "askSequence";

    let step = buildChatGptStep(item, lessonId, bookId, orderIndex);

    if (isAskSequence) {
      step = await applyScanToStep(step, { enabled: true, depth: scanDepth, multiPv: 1 });
    }

    const stepId = String(step.stepId);
    await createStep(owner, step);

    for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await appendStepIdToLesson(owner, lessonId, stepId, lessonRevision);
        lessonRevision++;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
        await waitMs(APPEND_RETRY_DELAY_MS * attempt);
        const fresh = await getLessonById(owner, lessonId);
        lessonRevision = Number((fresh as Record<string, unknown>)?.revision ?? lessonRevision);
      }
    }

    stepIds.push(stepId);
  }

  return { imported: stepIds.length, stepIds };
}

// ── full book import ──────────────────────────────────────────────────────────

export type FullImportResult = {
  bookId: string;
  bookTitle: string;
  lessonsCreated: number;
  stepsCreated: number;
};

export async function importStructuredBook(
  owner: OwnerContext,
  structure: StructuredBook & { bookTitle: string },
  scanConfig: ScanConfig = { enabled: false }
): Promise<FullImportResult> {
  const bookId = randomUUID();
  const now = new Date().toISOString();

  // Create the book
  await createBook(owner, {
    id: bookId,
    bookId,
    title: { values: { nl: structure.bookTitle, en: structure.bookTitle } },
    description: { values: { nl: "", en: "" } },
    status: "draft",
    tags: ["pdf-import"],
    lessonIds: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  });

  let bookRevision = 1;
  let stepsCreated = 0;

  for (const lesson of structure.lessons) {
    const lessonId = randomUUID();

    // Create lesson
    await createLesson(owner, {
      id: lessonId,
      lessonId,
      bookId,
      title: { values: { nl: lesson.title, en: lesson.title } },
      description: { values: { nl: "", en: "" } },
      variantId: "international",
      stepIds: [],
      createdAt: now,
      updatedAt: now,
    });

    // Register lesson on book (with retry)
    for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await appendLessonIdToBook(owner, bookId, lessonId, bookRevision);
        bookRevision++;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
        await waitMs(APPEND_RETRY_DELAY_MS * attempt);
        bookRevision++;
      }
    }

    let lessonRevision = 1;

    for (let i = 0; i < lesson.steps.length; i++) {
      const s = lesson.steps[i];
      let step = buildStep(
        { fen: s.fen, notes: s.notes, sideToMove: s.sideToMove },
        lessonId, bookId, i,
        scanConfig.enabled
      );
      step = await applyScanToStep(step, scanConfig);
      const stepId = String(step.stepId);
      await createStep(owner, step);

      for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
        try {
          await appendStepIdToLesson(owner, lessonId, stepId, lessonRevision);
          lessonRevision++;
          break;
        } catch (err) {
          if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
          await waitMs(APPEND_RETRY_DELAY_MS * attempt);
          const fresh = await getLessonById(owner, lessonId);
          lessonRevision = Number((fresh as Record<string, unknown>)?.revision ?? lessonRevision);
        }
      }
      stepsCreated++;
    }
  }

  return {
    bookId,
    bookTitle: structure.bookTitle,
    lessonsCreated: structure.lessons.length,
    stepsCreated,
  };
}

// ── import ChatGPT book JSON as a new book (grouped by page) ──────────────────

type ImportLessonGroup = { lessonTitle: string; globalIndices: number[] };

export async function importChatGptBookJson(
  owner: OwnerContext,
  input: ChatGptJsonInput,
  scanConfig: ScanConfig,
  explicitGroups?: ImportLessonGroup[],
): Promise<FullImportResult> {
  const rawTitle = typeof input.source === "string"
    ? input.source.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim()
    : "";
  const bookTitle = rawTitle || "Geïmporteerd boek";

  // Build lesson groups: use explicit grouping from frontend (with lesson titles) or fall back to page grouping
  type ResolvedGroup = { lessonTitle: string; diagrams: ChatGptDiagramItem[] };
  let resolvedGroups: ResolvedGroup[];

  if (explicitGroups && explicitGroups.length > 0) {
    resolvedGroups = explicitGroups.map((g) => ({
      lessonTitle: g.lessonTitle,
      diagrams: g.globalIndices
        .map((i) => input.diagrams[i])
        .filter((d): d is ChatGptDiagramItem => d !== undefined),
    }));
  } else {
    const byPage = new Map<number, ChatGptDiagramItem[]>();
    for (const d of input.diagrams) {
      const page = typeof d.page === "number" ? d.page : 0;
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page)!.push(d);
    }
    const pages = [...byPage.keys()].sort((a, b) => a - b);
    resolvedGroups = pages.map((page) => ({
      lessonTitle: page > 0 ? `Pagina ${page}` : "Diagrammen",
      diagrams: byPage.get(page)!,
    }));
  }

  const bookId = randomUUID();
  const now = new Date().toISOString();

  await createBook(owner, {
    id: bookId,
    bookId,
    title: { values: { nl: bookTitle, en: bookTitle } },
    description: { values: { nl: "", en: "" } },
    status: "draft",
    tags: ["chatgpt-import"],
    lessonIds: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  });

  let bookRevision = 1;
  let stepsCreated = 0;

  for (const { lessonTitle, diagrams } of resolvedGroups) {
    const lessonId = randomUUID();

    await createLesson(owner, {
      id: lessonId,
      lessonId,
      bookId,
      title: { values: { nl: lessonTitle, en: lessonTitle } },
      description: { values: { nl: "", en: "" } },
      variantId: "international",
      stepIds: [],
      createdAt: now,
      updatedAt: now,
    });

    for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await appendLessonIdToBook(owner, bookId, lessonId, bookRevision);
        bookRevision++;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
        await waitMs(APPEND_RETRY_DELAY_MS * attempt);
        bookRevision++;
      }
    }

    let lessonRevision = 1;

    for (let i = 0; i < diagrams.length; i++) {
      const d = diagrams[i];
      const item: ChatGptDiagramItem = { ...d, type: d.type ?? "askSequence" };

      let step = buildChatGptStep(item, lessonId, bookId, i);
      step = await applyScanToStep(step, scanConfig);
      const stepId = String(step.stepId);
      await createStep(owner, step);

      for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
        try {
          await appendStepIdToLesson(owner, lessonId, stepId, lessonRevision);
          lessonRevision++;
          break;
        } catch (err) {
          if (!(err instanceof ConflictError) || attempt >= APPEND_RETRY_ATTEMPTS) throw err;
          await waitMs(APPEND_RETRY_DELAY_MS * attempt);
          const fresh = await getLessonById(owner, lessonId);
          lessonRevision = Number((fresh as Record<string, unknown>)?.revision ?? lessonRevision);
        }
      }
      stepsCreated++;
    }
  }

  return { bookId, bookTitle, lessonsCreated: resolvedGroups.length, stepsCreated };
}

// ── enrich JSON diagrams with PDF page context ────────────────────────────────

export type EnrichPageInput = {
  page: number;
  localDiagrams: Array<{ globalIndex: number; localIndex: number }>;
};

export type EnrichedDiagram = {
  globalIndex: number;
  type: "askSequence" | "multipleChoice" | "presentation";
  question: string;
  options: Array<{ label: string; correct: boolean }>;
};

export type EnrichResult = {
  enriched: EnrichedDiagram[];
  pageThumbnails: Record<number, string>;
  pageLessonTitles: Record<number, string>;
};

export async function enrichDiagramsWithContext(
  pdfBuffer: Buffer,
  pageInputs: EnrichPageInput[],
): Promise<EnrichResult> {
  const tmpPdf = join(tmpdir(), `draughts_enrich_${randomUUID()}.pdf`);
  writeFileSync(tmpPdf, pdfBuffer);

  const enriched: EnrichedDiagram[] = [];
  const pageThumbnails: Record<number, string> = {};
  const pageLessonTitles: Record<number, string> = {};
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const preferredVisionModel = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5-thinking";

  try {
    for (const { page, localDiagrams } of pageInputs) {
      const n = localDiagrams.length;

      // Render once at high res for GPT, once at low res for thumbnail
      const [{ pngBuffer: fullRes }, { pngBuffer: thumb }] = await Promise.all([
        renderPdfPage(tmpPdf, page, 2.0),
        renderPdfPage(tmpPdf, page, 0.45),
      ]);
      pageThumbnails[page] = `data:image/png;base64,${thumb.toString("base64")}`;

      const prompt = `Je analyseert pagina ${page} uit een Nederlands damwerkboek. Er staan ${n} borddiagram${n !== 1 ? "men" : ""} op deze pagina, genummerd 1 t/m ${n} van links naar rechts en boven naar onder.

Geef terug als JSON object:
{
  "lessonTitle": "<ALLEEN invullen als op DEZE pagina een NIEUWE leskop staat (bijv. 'Les 3', 'Les 4 - Slaan', 'Opdracht 2', 'Hoofdstuk 5'). Lege string als de pagina een vervolg is van de vorige les zonder nieuwe kop.>",
  "diagrams": [
    {"diagramIndex": 1, "type": "askSequence", "question": "Hoe slaat wit?", "options": []},
    ...
  ]
}

Regel voor lessonTitle: zet ALLEEN een titel als er letterlijk een kopje als 'Les 1', 'Les 2', 'Les 3 - Naam' etc. op de pagina staat. 'Opdracht', 'Oefening', 'Opgave' zijn GEEN lessen — geef daarvoor altijd een lege string "". Als de pagina geen nieuwe leskop heeft (ook al zijn er oefeningen), geef dan een lege string "".

Voor elk diagram in "diagrams":
- type: "askSequence" (speler moet winnende combinatie vinden), "multipleChoice" (keuze uit opties), "presentation" (uitleg/demonstratie)
- question: de instructie of vraag bij het diagram (lege string als er geen is)
- options: bij multipleChoice, array van {label: string, correct: boolean}; anders []

Alleen het JSON object, geen markdown, geen uitleg.`;

      try {
        const resp = await createChatCompletionWithModelFallback(openai, preferredVisionModel, {
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${fullRes.toString("base64")}`, detail: "high" } },
              { type: "text", text: prompt },
            ],
          }],
        });

        const raw = (resp.choices[0]?.message?.content ?? "{}")
          .trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");

        const parsed = JSON.parse(raw) as {
          lessonTitle?: string;
          diagrams?: Array<{
            diagramIndex: number;
            type?: string;
            question?: string;
            options?: Array<{ label: string; correct: boolean }>;
          }>;
        };

        const rawTitle = typeof parsed.lessonTitle === "string" ? parsed.lessonTitle.trim() : "";
        // Accept common heading variants: "Les 3", "Les: 3", "LES3", "Les 3 - ..."
        // (still intentionally only lesson headings; exercises/opgaven remain excluded).
        const normalizedTitle = rawTitle
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (rawTitle && /^les\s*[:.\-]?\s*\d+/i.test(normalizedTitle)) {
          pageLessonTitles[page] = rawTitle;
        }

        for (const item of parsed.diagrams ?? []) {
          const d = localDiagrams.find((ld) => ld.localIndex === item.diagramIndex);
          if (!d) continue;
          enriched.push({
            globalIndex: d.globalIndex,
            type: item.type === "multipleChoice" ? "multipleChoice"
                : item.type === "presentation" ? "presentation"
                : "askSequence",
            question: item.question ?? "",
            options: item.options ?? [],
          });
        }
      } catch (err) {
        console.warn(`  [enrich] page ${page} GPT error:`, (err as Error).message);
        for (const d of localDiagrams) {
          enriched.push({ globalIndex: d.globalIndex, type: "askSequence", question: "", options: [] });
        }
      }
    }
  } finally {
    try { unlinkSync(tmpPdf); } catch { /* ignore */ }
  }

  return { enriched, pageThumbnails, pageLessonTitles };
}
