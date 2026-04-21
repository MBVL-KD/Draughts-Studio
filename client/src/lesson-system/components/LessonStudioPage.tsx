import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BoardState, PieceCode } from "../../features/board/boardTypes";
import {
  createEmptyBoardState,
} from "../../features/board/boardTypes";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import { resolveNotationToEngineMove } from "../utils/resolveNotationToEngineMove";
import {
  createEmptyBook,
  createEmptyLesson,
} from "../utils/lessonFactory";
import {
  deleteStep as deleteAuthoringStep,
  duplicateStep as duplicateAuthoringStep,
  insertStepAfter as insertAuthoringStepAfter,
  insertStepBefore as insertAuthoringStepBefore,
  moveStepDown as moveAuthoringStepDown,
  moveStepUp as moveAuthoringStepUp,
} from "../utils/authoringLessonSequence";
import { createDefaultAuthoringLessonStep } from "../utils/authoringLessonStepFactory";
import { syncLessonLegacyStepsFromAuthoring } from "../utils/syncAuthoringLesson";
import {
  createEnterBranchLinkMoment,
  deriveBranchInitialState,
  extractMomentsToLessonBranch,
} from "../utils/authoringBranchExtract";
import { setBranchTimeline } from "../utils/authoringBranchTimeline";
import {
  buildNewStepFromTimelineTail,
  extractMomentsToNewStep,
  splitStepAtMoment,
} from "../utils/authoringStepSplitExtract";
import { normalizeClip } from "../utils/authoringTargetSquaresClipboard";
import { normalizePlacePiecesClip } from "../utils/authoringPlacePiecesClipboard";
import { boardStateToExpectedPlacement } from "../utils/placementHelpers";
import { parsePreviewCountDraft } from "../utils/authoringCountComfort";
import { cloneStepMomentForAuthoringDuplicate } from "../utils/cloneStepMomentForAuthoring";
import { sortUniqueSquares } from "../utils/selectionSquareSetHelpers";
import { insertMomentAfter } from "../utils/timelineMomentSequence";
import { createMoment } from "../utils/timelineMomentFactories";
import { listQuickAddMomentTypes } from "../utils/timelineMomentFactories";
import { recordedMovesToExpectedSequenceSpecs } from "../utils/recordedMovesToExpectedSequence";
import {
  buildAskMoveMomentFromRecordingFirstPly,
  buildAskSequenceMomentFromRecording,
} from "../utils/recordedMovesToAskInteractionMoments";
import type { MomentPresentationRuntimeClip } from "../utils/momentPresentationRuntimeClipboard";
import {
  extractPresentationRuntimeClip,
  hasAnyPresentationRuntimeClip,
  mergePresentationRuntimeClip,
} from "../utils/momentPresentationRuntimeClipboard";
import { resolveAuthoringPreviewState } from "../utils/resolveAuthoringPreviewState";
import { createLocalizedText, readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import { buildLocalAuthoringPlaybackFallback } from "../utils/buildLocalAuthoringPlaybackFallback";
import type { LessonBranch } from "../types/authoring/branchTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type {
  AuthoringOverlaySpec,
  MoveReference,
  StepMoment,
} from "../types/authoring/timelineTypes";
import type { PlacePiecesExpectedSlot } from "../types/authoring/interactionTypes";
import type { Book, Lesson } from "../types/lessonTypes";
import type { LessonStep } from "../types/stepTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type {
  SourceDocument,
  AnalysisNode,
  SourceMetadata,
  SourceKind,
} from "../types/analysisTypes";
import { listBooks } from "../api/booksApi";
import { persistCurriculumBookDocument } from "../api/lessonStorageApi";
import { createSource, listSources, patchSource } from "../api/sourcesApi";
import { getStepPlayback } from "../api/playbackApi";
import type { ApiError } from "../api/httpClient";
import type { CurriculumSaveStatus } from "../storage/persistedBookTypes";
import { normalizeBookForSave, normalizeBookFromServer } from "../storage/normalizePersistedBook";
import {
  authoringValidationBlocksSave,
  formatAuthoringValidationIssues,
  prepareBookForPersistedSave,
} from "../storage/saveBookPipeline";
import { stableStringifyBookForSnapshot } from "../storage/stableBookSnapshot";
import { useCurriculumAutosave } from "../hooks/useCurriculumAutosave";
import { getDocumentId, getDocumentRevision } from "../utils/documentIds";
import { findMissingLocalizedTexts } from "../i18n/findMissingLocalizedTexts";
import { exportMissingTexts } from "../i18n/exportMissingTexts";
import { applyTranslatedTexts } from "../i18n/applyTranslatedTexts";
import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import BoardSceneCanvas from "./BoardSceneCanvas";
import ImportJobsPanel from "./ImportJobsPanel";
import StepPreviewPanel from "./StepPreviewPanel";
import AuthoringLessonStepsPanel from "./AuthoringLessonStepsPanel";
import StepTimelineEditor from "./StepTimelineEditor";
import AuthoringAskMoveMomentFields from "./AuthoringAskMoveMomentFields";
import AuthoringAskSequenceMomentFields from "./AuthoringAskSequenceMomentFields";
import AuthoringAskCountMomentFields from "./AuthoringAskCountMomentFields";
import AuthoringMultipleChoiceMomentFields from "./AuthoringMultipleChoiceMomentFields";
import AuthoringPlacePiecesMomentFields from "./AuthoringPlacePiecesMomentFields";
import AuthoringAskSelectSquaresMomentFields from "./AuthoringAskSelectSquaresMomentFields";
import AuthoringAskSelectPiecesMomentFields from "./AuthoringAskSelectPiecesMomentFields";
import AuthoringMomentComfortBar from "./AuthoringMomentComfortBar";
import AuthoringTimelineMomentFlowBar from "./AuthoringTimelineMomentFlowBar";
import AuthoringBranchActionMomentFields from "./AuthoringBranchActionMomentFields";
import AuthoringBranchEditorPanel from "./AuthoringBranchEditorPanel";
import AuthoringMomentPresentationPanel from "./AuthoringMomentPresentationPanel";
import AuthoringMomentRuntimePanel from "./AuthoringMomentRuntimePanel";
import AuthoringLinkedBranchPanel from "./AuthoringLinkedBranchPanel";
import AuthoringMomentTextFields from "./AuthoringMomentTextFields";
import AuthoringShowLineMomentFields from "./AuthoringShowLineMomentFields";
import SourceEditorPage from "./SourceEditorPage";
import type { SourceEditorAction, SourceEditorState } from "../source-editor/sourceEditorReducer";
import { sourceEditorReducer } from "../source-editor/sourceEditorReducer";
type MainTab = "editor" | "preview";
type WorkspaceTab = "curriculum" | "sources" | "imports";
type BoardThemeId =
  | "classic"
  | "slate"
  | "forest"
  | "ocean"
  | "sunset"
  | "sand"
  | "midnight"
  | "marble";
type PieceThemeId =
  | "classic"
  | "flat"
  | "glass"
  | "bronze"
  | "ivory"
  | "neon"
  | "ruby"
  | "mint";
type MissingTranslationEntry = {
  path: string;
  missing: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function createInitialBook(activeVariant: string): Book {
  const book = createEmptyBook();
  const lesson = book.lessons[0] ?? createEmptyLesson(book.id);

  lesson.variantId = activeVariant;

  if (!book.lessons.length) {
    book.lessons = [lesson];
  } else {
    book.lessons[0] = lesson;
  }

  return book;
}

function createRootNode(initialFen: string): AnalysisNode {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    childrenIds: [],
    variationOf: null,
    isMainline: true,
    plyIndex: 0,
    fenAfter: initialFen,
    glyphs: [],
    labels: [],
    highlights: [],
    arrows: [],
    routes: [],
  };
}

function createEmptySource(activeVariant: string): SourceDocument {
  const initialFen = boardStateToFen(createEmptyBoardState());
  const rootNode = createRootNode(initialFen);
  const timestamp = nowIso();
  const id = crypto.randomUUID();

  return {
    id,
    sourceId: id,
    schemaVersion: 1,
    revision: 1,
    kind: "analysis",
    format: "manual",
    title: {
      values: {
        en: "New source",
        nl: "Nieuwe bron",
      },
    },
    description: {
      values: {
        en: "",
        nl: "",
      },
    },
    variantId: activeVariant,
    initialFen,
    rootNodeId: rootNode.id,
    nodes: [rootNode],
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const SOURCE_TYPE_LABELS: Record<SourceKind, string> = {
  analysis: "Analysis",
  pdn_game: "PDN game",
  puzzle_tree: "Puzzle tree",
  study: "Study",
  manual_line: "Manual line",
  lesson_source: "Lesson source",
};

const DEFAULT_SOURCE_TITLES = new Set([
  "",
  "new source",
  "nieuwe bron",
  "untitled source",
  "onbenoemde bron",
]);

function buildSourceAutoTitle(meta?: SourceMetadata): string {
  const clean = (v?: string) => {
    const t = v?.trim() ?? "";
    if (!t) return "";
    const normalized = t.replace(/\s+/g, "");
    // Treat common PDN placeholder values as empty.
    if (
      normalized === "?" ||
      normalized === "*" ||
      /^\?+([./-]\?+)*$/.test(normalized) ||
      /^[*.?/-]+$/.test(normalized)
    ) {
      return "";
    }
    return t;
  };
  const white = clean(meta?.white);
  const black = clean(meta?.black);
  const result = clean(meta?.result);
  const event = clean(meta?.event);
  const date = clean(meta?.date);
  const publication = clean(meta?.publication);
  const author = clean(meta?.author);

  const players = white && black ? `${white} - ${black}` : white || black || "";
  const eventPart = [event, date].filter(Boolean).join(", ");

  let base = "Untitled source";
  if (players && eventPart) {
    base = `${players} · ${eventPart}`;
  } else if (players) {
    base = players;
  } else if (eventPart) {
    base = eventPart;
  } else if (publication) {
    base = publication;
  } else if (author) {
    base = author;
  } else {
    base = "Onbekend";
  }

  return result ? `${base} (${result})` : base;
}

function isAutoManagedTitle(currentTitle: string, previousAutoTitle: string): boolean {
  const normalized = currentTitle.trim().toLowerCase();
  if (DEFAULT_SOURCE_TITLES.has(normalized)) return true;
  if (!normalized) return true;
  const placeholderLike = normalized.replace(/[\s()[\].,_-]/g, "");
  if (
    placeholderLike &&
    (/^[?*]+$/.test(placeholderLike) || /^\?+\*$/.test(placeholderLike))
  ) {
    return true;
  }
  return normalized === previousAutoTitle.trim().toLowerCase();
}

function legacyColorToOverlayStyle(
  color: "primary" | "success" | "warning" | "danger" | "info" | undefined
): "focus" | "good" | "hint" | "danger" | "neutral" {
  if (!color) return "neutral";
  if (color === "primary") return "focus";
  if (color === "success") return "good";
  if (color === "warning") return "hint";
  if (color === "danger") return "danger";
  return "neutral";
}

function stepPresentationToMomentOverlays(step: LessonStep): AuthoringOverlaySpec[] {
  const highlights = (step.presentation.highlights ?? []).map((h) => ({
    type: "highlight" as const,
    id: h.id,
    squares: [...(h.squares ?? [])],
    style: legacyColorToOverlayStyle(h.color),
    pulse: h.pulse,
  }));
  const arrows = (step.presentation.arrows ?? [])
    .filter((a) => typeof a.from === "number" && typeof a.to === "number")
    .map((a) => ({
      type: "arrow" as const,
      id: a.id,
      from: a.from as number,
      to: a.to as number,
      style: legacyColorToOverlayStyle(a.color),
      dashed: a.dashed,
      label: a.label ? createLocalizedText(a.label, a.label) : undefined,
    }));
  const routes = (step.presentation.routes ?? [])
    .filter((r) => Array.isArray(r.squares) && r.squares.length > 0)
    .map((r) => ({
      type: "route" as const,
      id: r.id,
      path: [...r.squares],
      style: legacyColorToOverlayStyle(r.color),
    }));
  return [...highlights, ...arrows, ...routes];
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readStoredString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value && value.trim() ? value : fallback;
}

function normalizeSourceFromServer(source: SourceDocument): SourceDocument {
  const id = source.id ?? source.sourceId ?? crypto.randomUUID();
  return {
    ...source,
    id,
    sourceId: source.sourceId ?? id,
    schemaVersion: typeof source.schemaVersion === "number" ? source.schemaVersion : 1,
    revision: typeof source.revision === "number" ? source.revision : 1,
    variantId: source.variantId ?? "international",
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
  };
}

const BOARD_THEME_VARS: Record<BoardThemeId, Record<string, string>> = {
  classic: {
    "--board-border": "#4b3425",
    "--board-shadow": "0 10px 24px rgba(0,0,0,0.18)",
    "--board-light-square": "#ead7bf",
    "--board-dark-square": "linear-gradient(135deg, #8b6a4f 0%, #6f4f37 100%)",
    "--board-square-border": "#6f5847",
  },
  slate: {
    "--board-border": "#334155",
    "--board-shadow": "0 10px 24px rgba(15,23,42,0.24)",
    "--board-light-square": "#dbe2ea",
    "--board-dark-square": "linear-gradient(135deg, #64748b 0%, #475569 100%)",
    "--board-square-border": "#475569",
  },
  forest: {
    "--board-border": "#365314",
    "--board-shadow": "0 10px 24px rgba(20,83,45,0.24)",
    "--board-light-square": "#e9f5df",
    "--board-dark-square": "linear-gradient(135deg, #65a30d 0%, #3f6212 100%)",
    "--board-square-border": "#3f6212",
  },
  ocean: {
    "--board-border": "#0f4c5c",
    "--board-shadow": "0 10px 24px rgba(2,132,199,0.24)",
    "--board-light-square": "#e0f2fe",
    "--board-dark-square": "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
    "--board-square-border": "#0369a1",
  },
  sunset: {
    "--board-border": "#7c2d12",
    "--board-shadow": "0 10px 24px rgba(194,65,12,0.24)",
    "--board-light-square": "#ffedd5",
    "--board-dark-square": "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
    "--board-square-border": "#c2410c",
  },
  sand: {
    "--board-border": "#854d0e",
    "--board-shadow": "0 10px 24px rgba(146,64,14,0.22)",
    "--board-light-square": "#fef9c3",
    "--board-dark-square": "linear-gradient(135deg, #facc15 0%, #ca8a04 100%)",
    "--board-square-border": "#a16207",
  },
  midnight: {
    "--board-border": "#111827",
    "--board-shadow": "0 12px 28px rgba(3,7,18,0.35)",
    "--board-light-square": "#e5e7eb",
    "--board-dark-square": "linear-gradient(135deg, #374151 0%, #111827 100%)",
    "--board-square-border": "#1f2937",
  },
  marble: {
    "--board-border": "#475569",
    "--board-shadow": "0 10px 24px rgba(71,85,105,0.24)",
    "--board-light-square": "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
    "--board-dark-square": "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
    "--board-square-border": "#94a3b8",
  },
};

const PIECE_THEME_VARS: Record<PieceThemeId, Record<string, string>> = {
  classic: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #ffffff, #d9d9d9 70%, #b8b8b8 100%)",
    "--piece-white-border": "#9a9a9a",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #666666, #2f2f2f 70%, #141414 100%)",
    "--piece-black-border": "#0f0f0f",
  },
  flat: {
    "--piece-white-bg": "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
    "--piece-white-border": "#94a3b8",
    "--piece-black-bg": "linear-gradient(180deg, #334155 0%, #0f172a 100%)",
    "--piece-black-border": "#020617",
  },
  glass: {
    "--piece-white-bg": "radial-gradient(circle at 32% 28%, #ffffff, #e2f3ff 55%, #c7d2fe 100%)",
    "--piece-white-border": "#93c5fd",
    "--piece-black-bg": "radial-gradient(circle at 32% 28%, #64748b, #1e293b 55%, #020617 100%)",
    "--piece-black-border": "#0f172a",
  },
  bronze: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #fef3c7, #f59e0b 70%, #b45309 100%)",
    "--piece-white-border": "#b45309",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #78350f, #451a03 70%, #1c0a00 100%)",
    "--piece-black-border": "#1c0a00",
  },
  ivory: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #fffef7, #f5f5dc 70%, #d6d3c4 100%)",
    "--piece-white-border": "#a8a29e",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #4b5563, #1f2937 70%, #020617 100%)",
    "--piece-black-border": "#0f172a",
  },
  neon: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #ecfeff, #67e8f9 70%, #0891b2 100%)",
    "--piece-white-border": "#0e7490",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #a78bfa, #6d28d9 70%, #2e1065 100%)",
    "--piece-black-border": "#2e1065",
  },
  ruby: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #ffe4e6, #fb7185 70%, #be123c 100%)",
    "--piece-white-border": "#be123c",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #450a0a, #1f0a0a 70%, #030712 100%)",
    "--piece-black-border": "#030712",
  },
  mint: {
    "--piece-white-bg": "radial-gradient(circle at 30% 30%, #ecfdf5, #6ee7b7 70%, #10b981 100%)",
    "--piece-white-border": "#059669",
    "--piece-black-bg": "radial-gradient(circle at 30% 30%, #14532d, #064e3b 70%, #022c22 100%)",
    "--piece-black-border": "#022c22",
  },
};

function getMissingLanguages(
  value: unknown,
  required: string[] = ["en", "nl"]
): string[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("values" in value) ||
    typeof (value as { values?: unknown }).values !== "object" ||
    (value as { values?: unknown }).values === null
  ) {
    return [...required];
  }
  const values = (value as { values: Record<string, unknown> }).values;
  return required.filter((language) => {
    const text = values[language];
    return typeof text !== "string" || !text.trim();
  });
}

function collectMissingTranslationsForStep(
  step: LessonStep | null,
  prefix = "step"
): MissingTranslationEntry[] {
  if (!step) return [];
  const entries: MissingTranslationEntry[] = [];
  const push = (path: string, value: unknown) => {
    const missing = getMissingLanguages(value);
    if (missing.length > 0) entries.push({ path, missing });
  };

  push(`${prefix}.title`, step.title);
  push(`${prefix}.prompt`, step.prompt);
  push(`${prefix}.hint`, step.hint);
  push(`${prefix}.explanation`, step.explanation);
  push(`${prefix}.feedback.correct`, step.feedback?.correct);
  push(`${prefix}.feedback.incorrect`, step.feedback?.incorrect);
  push(`${prefix}.presentation.npc.text`, step.presentation?.npc?.text);

  if (step.validation.type === "multiple_choice") {
    (step.validation.options ?? []).forEach((option, index) => {
      const hasLocalizedShape =
        option &&
        typeof option === "object" &&
        option.label &&
        typeof option.label === "object" &&
        "values" in option.label;
      if (hasLocalizedShape) {
        push(`${prefix}.validation.options.${index}.label`, option.label);
      }
    });
  }

  return entries;
}

function collectMissingTranslationsForSource(
  source: SourceDocument | null,
  prefix = "source"
): MissingTranslationEntry[] {
  if (!source) return [];
  const entries: MissingTranslationEntry[] = [];
  const push = (path: string, value: unknown) => {
    const missing = getMissingLanguages(value);
    if (missing.length > 0) entries.push({ path, missing });
  };
  push(`${prefix}.title`, source.title);
  push(`${prefix}.description`, source.description);
  source.nodes.forEach((node, index) => {
    if (node.preMoveComment) {
      push(`${prefix}.nodes.${index}.preMoveComment`, node.preMoveComment);
    }
    if (node.comment) {
      push(`${prefix}.nodes.${index}.comment`, node.comment);
    }
  });
  return entries;
}

function formatApiError(error: ApiError | undefined, fallback: string): string {
  if (!error) return fallback;
  const base = error.message || fallback;
  const issues = Array.isArray(error.issues) ? error.issues : [];
  if (issues.length === 0) return base;
  const top = issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(" | ");
  return `${base} — ${top}`;
}

export default function LessonStudioPage() {
  const [editorLanguage, setEditorLanguage] = useState<LanguageCode>(() => {
    const value = readStoredString("studio.editorLanguage", "nl");
    return value === "en" || value === "nl" ? value : "nl";
  });
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>(() => {
    const value = readStoredString("studio.boardTheme", "classic");
    return value === "slate" ||
      value === "forest" ||
      value === "ocean" ||
      value === "sunset" ||
      value === "sand" ||
      value === "midnight" ||
      value === "marble"
      ? value
      : "classic";
  });
  const [pieceTheme, setPieceTheme] = useState<PieceThemeId>(() => {
    const value = readStoredString("studio.pieceTheme", "classic");
    return value === "flat" ||
      value === "glass" ||
      value === "bronze" ||
      value === "ivory" ||
      value === "neon" ||
      value === "ruby" ||
      value === "mint"
      ? value
      : "classic";
  });
  const [defaultScanDepth, setDefaultScanDepth] = useState<number>(() => {
    const raw = readStoredString("studio.defaultScanDepth", "8");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 8;
    return Math.max(1, Math.min(99, Math.floor(parsed)));
  });
  const [replayMoveSecondsPerStep, setReplayMoveSecondsPerStep] = useState<number>(() => {
    const raw = readStoredString("studio.replayMoveSecondsPerStep", "0.45");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(2, parsed));
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [i18nPanelOpen, setI18nPanelOpen] = useState(false);
  const [activeVariant] = useState<string>("international");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("curriculum");

  const [books, setBooks] = useState<Book[]>(() => [
    createInitialBook("international"),
  ]);

  const [sources, setSources] = useState<SourceDocument[]>(() => [
    createEmptySource("international"),
  ]);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    books[0]?.id ?? null
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    books[0]?.lessons[0]?.id ?? null
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    books[0]?.lessons[0]?.steps[0]?.id ?? null
  );
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [editorFocusedAskSequencePly, setEditorFocusedAskSequencePly] = useState<number | null>(null);
  const [authoringInspectedBranchId, setAuthoringInspectedBranchId] = useState<
    string | null
  >(null);
  const [selectedBranchMomentId, setSelectedBranchMomentId] = useState<string | null>(
    null
  );
  const [authoringPresentationRuntimeClip, setAuthoringPresentationRuntimeClip] =
    useState<MomentPresentationRuntimeClip | null>(null);
  /** Deep template; each paste runs `cloneStepMomentForAuthoringDuplicate` for fresh ids. */
  const [wholeMomentClipboard, setWholeMomentClipboard] = useState<StepMoment | null>(null);
  /** Bundel 12b: shared squares when picking askSelect* targets on the studio board / preview. */
  const [authoringStudioSquareSelection, setAuthoringStudioSquareSelection] = useState<number[]>(
    []
  );
  const [authoringBoardTargetPickMode, setAuthoringBoardTargetPickMode] = useState(false);
  const [authoringTargetSquaresClip, setAuthoringTargetSquaresClip] = useState<number[] | null>(
    null
  );
  const [authoringAskCountPreviewDraft, setAuthoringAskCountPreviewDraft] = useState("");
  /** Bundel 14b: internal clip for placePieces expectedPlacement rows. */
  const [authoringPlacePiecesClip, setAuthoringPlacePiecesClip] = useState<
    PlacePiecesExpectedSlot[] | null
  >(null);
  /** Bundel 14b: preview panel reads target into empty placement board. */
  const [placePiecesPreviewLoadRequest, setPlacePiecesPreviewLoadRequest] = useState<{
    key: number;
    slots: PlacePiecesExpectedSlot[];
  } | null>(null);
  const placePiecesPreviewBoardGetterRef = useRef<(() => BoardState | null) | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    sources[0]?.id ?? null
  );
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [bookRevisions, setBookRevisions] = useState<Record<string, number>>({});
  const [sourceRevisions, setSourceRevisions] = useState<Record<string, number>>({});
  const curriculumSnapshotRef = useRef<Record<string, string>>({});
  const [curriculumSaveStatus, setCurriculumSaveStatus] = useState<CurriculumSaveStatus>("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  const [playbackMessage, setPlaybackMessage] = useState<string>("");
  const [playbackError, setPlaybackError] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflictState, setConflictState] = useState<{
    kind: "book" | "source";
    id: string;
    message: string;
  } | null>(null);

  const booksRef = useRef(books);
  booksRef.current = books;
  const selectedBookIdRef = useRef(selectedBookId);
  selectedBookIdRef.current = selectedBookId;
  const bookRevisionsRef = useRef(bookRevisions);
  bookRevisionsRef.current = bookRevisions;

  const [autosaveBusy, setAutosaveBusy] = useState(false);
  const [autosaveHint, setAutosaveHint] = useState("");

  const [currentBrush, setCurrentBrush] = useState<PieceCode | "eraser">("wm");
  const [mainTab, setMainTab] = useState<MainTab>("editor");
  const [translationsImportJson, setTranslationsImportJson] = useState("");

  const visibleBooks = useMemo(() => {
    const filtered = books.filter((book) =>
      book.lessons.some((lesson) => (lesson.variantId ?? activeVariant) === activeVariant)
    );
    return filtered.length > 0 ? filtered : books;
  }, [books, activeVariant]);

  const selectedBook = useMemo(
    () => visibleBooks.find((book) => book.id === selectedBookId) ?? null,
    [visibleBooks, selectedBookId]
  );

  const curriculumPersistPreview = useMemo(() => {
    if (!selectedBook) return null;
    return prepareBookForPersistedSave(selectedBook);
  }, [selectedBook]);

  const curriculumSaveBlocked = !!(
    curriculumPersistPreview && authoringValidationBlocksSave(curriculumPersistPreview.validation)
  );

  const curriculumContentFingerprint = useMemo(() => {
    if (!selectedBook) return null;
    return stableStringifyBookForSnapshot(normalizeBookForSave(selectedBook));
  }, [selectedBook]);

  const applyStoredCurriculumBook = useCallback((storedBook: Book, bookId: string) => {
    curriculumSnapshotRef.current[bookId] = stableStringifyBookForSnapshot(
      normalizeBookForSave(storedBook)
    );
    setBooks((prev) =>
      prev.map((book) => (getDocumentId(book) === bookId ? storedBook : book))
    );
    setBookRevisions((prev) => ({
      ...prev,
      [bookId]: getDocumentRevision(storedBook),
    }));
    setConflictState(null);
    setCurriculumSaveStatus("saved");
  }, []);

  useCurriculumAutosave({
    enabled: true,
    workspaceTab,
    selectedBook,
    booksRef,
    selectedBookIdRef,
    bookRevisionsRef,
    curriculumSnapshotRef,
    conflictState,
    blockAutosave: isSyncing,
    contentFingerprint: curriculumContentFingerprint,
    onPersistSuccess: applyStoredCurriculumBook,
    setAutosaveBusy,
    setAutosaveHint,
    editorLanguage,
  });

  const visibleLessons = useMemo(() => {
    const all = selectedBook?.lessons ?? [];
    const filtered = all.filter(
      (lesson) => (lesson.variantId ?? activeVariant) === activeVariant
    );
    return filtered.length > 0 ? filtered : all;
  }, [selectedBook, activeVariant]);

  const selectedLesson = useMemo(
    () =>
      visibleLessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [visibleLessons, selectedLessonId]
  );

  const authoringStepOrder = useMemo((): AuthoringLessonStep[] => {
    if (!selectedLesson?.authoringV2) return [];
    const b = selectedLesson.authoringV2;
    return b.authoringLesson.stepIds
      .map((id) => b.stepsById[id])
      .filter((s): s is AuthoringLessonStep => !!s);
  }, [selectedLesson]);

  const selectedStep = useMemo(
    () => selectedLesson?.steps.find((step) => step.id === selectedStepId) ?? null,
    [selectedLesson, selectedStepId]
  );
  const selectedStepIndex = useMemo(() => {
    if (!selectedLesson || !selectedStepId) return -1;
    if (selectedLesson.authoringV2) {
      return selectedLesson.authoringV2.authoringLesson.stepIds.indexOf(selectedStepId);
    }
    return selectedLesson.steps.findIndex((step) => step.id === selectedStepId);
  }, [selectedLesson, selectedStepId]);
  const hasPreviousPreviewStep = selectedStepIndex > 0;
  const hasNextPreviewStep =
    selectedLesson != null &&
    selectedStepIndex >= 0 &&
    selectedStepIndex < selectedLesson.steps.length - 1;

  const selectedAuthoringMoment = useMemo(() => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return null;
    const tm = selectedLesson.authoringV2.stepsById[selectedStepId]?.timeline ?? [];
    return tm.find((m) => m.id === selectedMomentId) ?? null;
  }, [selectedLesson, selectedStepId, selectedMomentId]);

  const selectedBranchAuthoringMoment = useMemo(() => {
    if (!authoringInspectedBranchId || !selectedLesson?.authoringV2) return null;
    const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
    const tl = br?.timeline ?? [];
    if (!selectedBranchMomentId) return null;
    return tl.find((m) => m.id === selectedBranchMomentId) ?? null;
  }, [authoringInspectedBranchId, selectedBranchMomentId, selectedLesson]);

  const interactivePreviewTypes = new Set([
    "askMove",
    "askSequence",
    "askCount",
    "askSelectSquares",
    "askSelectPieces",
    "multipleChoice",
    "placePieces",
  ]);

  const authoringInteractiveMomentForPreview =
    authoringInspectedBranchId &&
    selectedBranchAuthoringMoment &&
    interactivePreviewTypes.has(selectedBranchAuthoringMoment.type)
      ? selectedBranchAuthoringMoment
      : selectedAuthoringMoment && interactivePreviewTypes.has(selectedAuthoringMoment.type)
        ? selectedAuthoringMoment
        : null;

  const authoringPreviewResolved = useMemo(() => {
    if (authoringInspectedBranchId && selectedLesson?.authoringV2) {
      const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
      if (!br) return null;
      const tl = br.timeline ?? [];
      const bm =
        selectedBranchMomentId != null
          ? tl.find((m) => m.id === selectedBranchMomentId) ?? null
          : null;
      const pseudoStep: AuthoringLessonStep = {
        id: "__branch_preview__",
        lessonId: br.lessonId,
        kind: "explain",
        orderIndex: 0,
        title: br.title ?? createLocalizedText("", ""),
        initialState: {
          fen: br.initialState?.fen ?? "",
          sideToMove: br.initialState?.sideToMove ?? "white",
          variantId: br.initialState?.variantId,
          rulesetId: br.initialState?.rulesetId,
        },
        timeline: [],
      };
      return resolveAuthoringPreviewState(pseudoStep, bm, {
        language: editorLanguage,
      });
    }
    if (!selectedLesson?.authoringV2 || !selectedStepId) return null;
    const aStep = selectedLesson.authoringV2.stepsById[selectedStepId];
    if (!aStep) return null;
    const moment =
      selectedMomentId != null
        ? aStep.timeline.find((m) => m.id === selectedMomentId) ?? null
        : null;
    return resolveAuthoringPreviewState(aStep, moment, {
      language: editorLanguage,
    });
  }, [
    authoringInspectedBranchId,
    selectedBranchMomentId,
    selectedLesson,
    selectedStepId,
    selectedMomentId,
    editorLanguage,
  ]);

  useEffect(() => {
    const mt = authoringInspectedBranchId
      ? selectedBranchAuthoringMoment?.type
      : selectedAuthoringMoment?.type;
    if (mt !== "askSelectSquares" && mt !== "askSelectPieces") {
      setAuthoringBoardTargetPickMode(false);
      setAuthoringStudioSquareSelection([]);
    }
  }, [
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment?.type,
    selectedAuthoringMoment?.type,
    selectedMomentId,
    selectedBranchMomentId,
  ]);

  useEffect(() => {
    const mt = authoringInspectedBranchId
      ? selectedBranchAuthoringMoment?.type
      : selectedAuthoringMoment?.type;
    if (mt !== "askCount") {
      setAuthoringAskCountPreviewDraft("");
    }
  }, [
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment?.type,
    selectedAuthoringMoment?.type,
    selectedMomentId,
    selectedBranchMomentId,
  ]);

  useEffect(() => {
    setPlacePiecesPreviewLoadRequest(null);
  }, [selectedMomentId, selectedBranchMomentId, authoringInspectedBranchId]);

  useEffect(() => {
    setEditorFocusedAskSequencePly(null);
  }, [selectedMomentId, selectedBranchMomentId, selectedStepId, authoringInspectedBranchId]);

  const handleFocusAskSequencePly = useCallback((index: number) => {
    setEditorFocusedAskSequencePly(index);
    setMainTab("editor");
  }, []);

  const editorFocusedAskSequenceFen = useMemo(() => {
    if (editorFocusedAskSequencePly == null) return null;
    const m = authoringInspectedBranchId ? selectedBranchAuthoringMoment : selectedAuthoringMoment;
    if (!m || m.type !== "askSequence" || m.interaction?.kind !== "askSequence") return null;
    const seq = m.interaction.expectedSequence ?? [];
    if (editorFocusedAskSequencePly < 0 || editorFocusedAskSequencePly >= seq.length) return null;
    const startFen = (authoringPreviewResolved?.fen ?? selectedStep?.initialState?.fen ?? "").trim();
    if (!startFen) return null;
    try {
      let board = fenToBoardState(startFen);
      for (let i = 0; i < editorFocusedAskSequencePly; i += 1) {
        const s = seq[i];
        if (!s) return null;
        const isCapture = (s.captures?.length ?? 0) > 0 || ((s.path?.length ?? 0) > 2);
        const notation = s.path && s.path.length >= 2 ? s.path.join(isCapture ? "x" : "-") : `${s.from}-${s.to}`;
        const em = resolveNotationToEngineMove(board, notation);
        if (!em) return null;
        board = fenToBoardState(em.fenAfter);
      }
      return boardStateToFen(board);
    } catch {
      return null;
    }
  }, [
    editorFocusedAskSequencePly,
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment,
    selectedAuthoringMoment,
    authoringPreviewResolved?.fen,
    selectedStep?.initialState?.fen,
  ]);

  const authoringAskSequenceHintForBoard = useMemo(() => {
    if (editorFocusedAskSequenceFen) return null;
    if (!selectedLesson?.authoringV2) return null;
    const m = authoringInteractiveMomentForPreview;
    if (m?.type !== "askSequence" || m.interaction?.kind !== "askSequence") return null;
    return { expectedSequence: m.interaction.expectedSequence ?? [] };
  }, [editorFocusedAskSequenceFen, selectedLesson?.authoringV2, authoringInteractiveMomentForPreview]);

  const authoringAskSelectPiecesOnly = useMemo(() => {
    if (authoringInspectedBranchId) {
      return selectedBranchAuthoringMoment?.type === "askSelectPieces";
    }
    return selectedAuthoringMoment?.type === "askSelectPieces";
  }, [
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment?.type,
    selectedAuthoringMoment?.type,
  ]);

  /** Bundel 14a: FEN read for “use current board as target” (main editor step or branch start). */
  const placementEditorSourceFen = useMemo(() => {
    if (authoringInspectedBranchId && selectedLesson?.authoringV2) {
      const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
      const fen = br?.initialState?.fen?.trim();
      if (fen) return fen;
    }
    return selectedStep?.initialState?.fen?.trim() ?? "";
  }, [authoringInspectedBranchId, selectedLesson, selectedStep]);

  const branchPickerChoices = useMemo(() => {
    if (!selectedLesson?.authoringV2?.branchesById) return [];
    return Object.entries(selectedLesson.authoringV2.branchesById).map(([id, b]) => ({
      id,
      label: readLocalizedText(b.title, editorLanguage).trim() || id.slice(0, 8),
    }));
  }, [selectedLesson, editorLanguage]);

  const authoringPresentationMoment = useMemo(() => {
    if (authoringInspectedBranchId) return selectedBranchAuthoringMoment;
    return selectedAuthoringMoment;
  }, [authoringInspectedBranchId, selectedBranchAuthoringMoment, selectedAuthoringMoment]);

  const authoringPresentationRuntimeCanPaste = useMemo(
    () =>
      authoringPresentationRuntimeClip != null &&
      hasAnyPresentationRuntimeClip(authoringPresentationRuntimeClip),
    [authoringPresentationRuntimeClip]
  );

  useEffect(() => {
    if (!selectedLesson?.authoringV2 || !selectedStepId) {
      setSelectedMomentId(null);
      setAuthoringInspectedBranchId(null);
      return;
    }
    const st = selectedLesson.authoringV2.stepsById[selectedStepId];
    const tl = st?.timeline ?? [];
    setSelectedMomentId((prev) => {
      if (prev && tl.some((m) => m.id === prev)) return prev;
      return tl[0]?.id ?? null;
    });
  }, [selectedLesson, selectedStepId]);

  useEffect(() => {
    setAuthoringInspectedBranchId(null);
  }, [selectedStepId]);

  useEffect(() => {
    if (!authoringInspectedBranchId || !selectedLesson?.authoringV2) {
      setSelectedBranchMomentId(null);
      return;
    }
    const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
    const tl = br?.timeline ?? [];
    setSelectedBranchMomentId((prev) => {
      if (prev && tl.some((m) => m.id === prev)) return prev;
      return tl[0]?.id ?? null;
    });
  }, [authoringInspectedBranchId, selectedLesson]);

  const visibleSources = useMemo(() => {
    return sources.filter((source) => source.variantId === activeVariant);
  }, [sources, activeVariant]);

  const filteredSources = useMemo(() => {
    const query = sourceSearchQuery.trim().toLowerCase();
    if (!query) return visibleSources;
    return visibleSources.filter((source) => {
      const title = readLocalizedText(source.title, editorLanguage).toLowerCase();
      const white = source.sourceMeta?.white?.toLowerCase() ?? "";
      const black = source.sourceMeta?.black?.toLowerCase() ?? "";
      const event = source.sourceMeta?.event?.toLowerCase() ?? "";
      return (
        title.includes(query) ||
        white.includes(query) ||
        black.includes(query) ||
        event.includes(query)
      );
    });
  }, [visibleSources, sourceSearchQuery, editorLanguage]);

  const selectedSource = useMemo(
    () => visibleSources.find((source) => source.id === selectedSourceId) ?? null,
    [visibleSources, selectedSourceId]
  );

  const translationGaps = useMemo(() => {
    if (workspaceTab === "curriculum") {
      return collectMissingTranslationsForStep(selectedStep);
    }
    return collectMissingTranslationsForSource(selectedSource);
  }, [workspaceTab, selectedStep, selectedSource]);

  const hasValidSource =
    !!selectedSource &&
    Array.isArray(selectedSource.nodes) &&
    selectedSource.nodes.length > 0 &&
    typeof selectedSource.rootNodeId === "string";

  useEffect(() => {
    if (workspaceTab !== "curriculum" || !selectedBook || isSyncing || autosaveBusy) return;
    const bookId = getDocumentId(selectedBook);
    const snap = stableStringifyBookForSnapshot(normalizeBookForSave(selectedBook));
    const prev = curriculumSnapshotRef.current[bookId];
    if (prev === undefined) {
      curriculumSnapshotRef.current[bookId] = snap;
      setCurriculumSaveStatus((s) => (s === "saving" || s === "error" ? s : "saved"));
      return;
    }
    if (prev !== snap) {
      setCurriculumSaveStatus((s) => (s === "saving" ? s : "dirty"));
      if (!conflictState) setSyncError("");
    } else {
      setCurriculumSaveStatus((s) => (s === "saving" || s === "error" ? s : "saved"));
    }
  }, [workspaceTab, selectedBook, isSyncing, autosaveBusy, conflictState]);

  const activeStatus = useMemo(() => {
    if (workspaceTab === "curriculum" && playbackError) {
      return { kind: "error" as const, text: playbackError };
    }
    if (syncError) return { kind: "error" as const, text: syncError };
    if (workspaceTab === "curriculum" && playbackMessage) {
      return { kind: "success" as const, text: playbackMessage };
    }
    if (syncMessage) return { kind: "success" as const, text: syncMessage };
    return null;
  }, [workspaceTab, playbackError, syncError, playbackMessage, syncMessage]);

  useEffect(() => {
    if (workspaceTab !== "curriculum") {
      setPlaybackError("");
      setPlaybackMessage("");
    }
  }, [workspaceTab]);

  const rootThemeStyle = useMemo(() => {
    return {
      ...BOARD_THEME_VARS[boardTheme],
      ...PIECE_THEME_VARS[pieceTheme],
    } as CSSProperties;
  }, [boardTheme, pieceTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studio.editorLanguage", editorLanguage);
  }, [editorLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studio.boardTheme", boardTheme);
  }, [boardTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studio.pieceTheme", pieceTheme);
  }, [pieceTheme]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studio.defaultScanDepth", String(defaultScanDepth));
  }, [defaultScanDepth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studio.replayMoveSecondsPerStep", String(replayMoveSecondsPerStep));
  }, [replayMoveSecondsPerStep]);

  useEffect(() => {
    if (visibleBooks.length === 0) {
      setSelectedBookId(null);
      setSelectedLessonId(null);
      setSelectedStepId(null);
      return;
    }

    const nextBook =
      visibleBooks.find((book) => book.id === selectedBookId) ?? visibleBooks[0];

    if (nextBook.id !== selectedBookId) {
      setSelectedBookId(nextBook.id);
    }

    const nextVisibleLessons = nextBook.lessons.filter(
      (lesson) => lesson.variantId === activeVariant
    );
    const nextLesson =
      nextVisibleLessons.find((lesson) => lesson.id === selectedLessonId) ??
      nextVisibleLessons[0] ??
      null;

    if ((nextLesson?.id ?? null) !== selectedLessonId) {
      setSelectedLessonId(nextLesson?.id ?? null);
    }

    const nextStep =
      nextLesson?.steps.find((step) => step.id === selectedStepId) ??
      nextLesson?.steps[0] ??
      null;

    if ((nextStep?.id ?? null) !== selectedStepId) {
      setSelectedStepId(nextStep?.id ?? null);
    }
  }, [visibleBooks, selectedBookId, selectedLessonId, selectedStepId, activeVariant]);

  useEffect(() => {
    if (visibleSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }

    const nextSource =
      visibleSources.find((source) => source.id === selectedSourceId) ??
      visibleSources[0];

    if (nextSource.id !== selectedSourceId) {
      setSelectedSourceId(nextSource.id);
    }
  }, [visibleSources, selectedSourceId]);

  useEffect(() => {
    if (workspaceTab !== "sources") return;
    if (!sourceSearchQuery.trim()) return;
    if (filteredSources.length === 0) return;
    if (filteredSources.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(filteredSources[0].id);
  }, [workspaceTab, sourceSearchQuery, filteredSources, selectedSourceId]);

  const updateSelectedBook = (updater: (book: Book) => Book) => {
    if (!selectedBookId) return;

    setBooks((prev) =>
      prev.map((book) => (book.id === selectedBookId ? updater(book) : book))
    );
  };

  const updateSelectedLesson = (updater: (lesson: Lesson) => Lesson) => {
    if (!selectedBookId || !selectedLessonId) return;

    setBooks((prev) =>
      prev.map((book) =>
        book.id !== selectedBookId
          ? book
          : {
              ...book,
              lessons: book.lessons.map((lesson) =>
                lesson.id === selectedLessonId ? updater(lesson) : lesson
              ),
            }
      )
    );
  };

  const updateSelectedSource = (
    updater: (source: SourceDocument) => SourceDocument
  ) => {
    if (!selectedSourceId) return;

    setSources((prev) =>
      prev.map((source) =>
        source.id === selectedSourceId
          ? {
              ...updater(source),
              updatedAt: nowIso(),
            }
          : source
      )
    );
  };

  const syncRevisionMaps = (nextBooks: Book[], nextSources: SourceDocument[]) => {
    setBookRevisions(
      Object.fromEntries(nextBooks.map((book) => [getDocumentId(book), getDocumentRevision(book)]))
    );
    setSourceRevisions(
      Object.fromEntries(
        nextSources.map((source) => [getDocumentId(source), getDocumentRevision(source)])
      )
    );
  };

  const handleLoadFromServer = async () => {
    setIsSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      const [booksResponse, sourcesResponse] = await Promise.all([
        listBooks({ sort: "updatedAt_desc", limit: 200 }),
        listSources({ sort: "updatedAt_desc", limit: 400 }),
      ]);
      const nextBooks = asArray<Book>(booksResponse?.items).map(normalizeBookFromServer);
      const nextSources = asArray<SourceDocument>(sourcesResponse?.items).map(
        normalizeSourceFromServer
      );
      setBooks(nextBooks);
      setSources(nextSources);
      syncRevisionMaps(nextBooks, nextSources);
      nextBooks.forEach((book) => {
        const bid = getDocumentId(book);
        curriculumSnapshotRef.current[bid] = stableStringifyBookForSnapshot(
          normalizeBookForSave(book)
        );
      });
      setCurriculumSaveStatus("saved");
      const nextBook = nextBooks[0] ?? null;
      const nextLesson = nextBook?.lessons[0] ?? null;
      const nextStep = nextLesson?.steps?.[0] ?? null;
      setSelectedBookId(nextBook?.id ?? null);
      setSelectedLessonId(nextLesson?.id ?? null);
      setSelectedStepId(nextStep?.id ?? null);
      setSelectedSourceId(nextSources[0]?.id ?? null);
      setSyncMessage("Loaded latest books and sources from server.");
    } catch (error) {
      const apiError = error as ApiError;
      setSyncError(formatApiError(apiError, "Failed to load from server."));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCurrentToServer = async () => {
    setIsSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      if (workspaceTab === "curriculum") {
        if (!selectedBook) throw new Error("No selected book.");
        const { document: bookToSave, validation } = prepareBookForPersistedSave(selectedBook);
        if (authoringValidationBlocksSave(validation)) {
          setCurriculumSaveStatus("error");
          setSyncError(formatAuthoringValidationIssues(validation, 12));
          return;
        }
        setCurriculumSaveStatus("saving");
        const bookId = getDocumentId(bookToSave);
        const knownRevision = bookRevisions[bookId];
        const response = await persistCurriculumBookDocument({
          book: bookToSave,
          knownRevision,
        });
        const storedBook = normalizeBookFromServer(response.item);
        applyStoredCurriculumBook(storedBook, bookId);
        const warnHint =
          validation.warnings.length > 0
            ? ` (${validation.warnings.length} authoring warning${validation.warnings.length === 1 ? "" : "s"})`
            : "";
        setSyncMessage(`Book saved to server.${warnHint}`);
        return;
      }

      if (!selectedSource) throw new Error("No selected source.");
      const sourceId = getDocumentId(selectedSource);
      const knownRevision = sourceRevisions[sourceId];
      let storedSource: SourceDocument;
      if (typeof knownRevision === "number" && Number.isFinite(knownRevision)) {
        const response = await patchSource(sourceId, knownRevision, selectedSource);
        storedSource = normalizeSourceFromServer(response.item);
      } else {
        const createResponse = await createSource(selectedSource);
        storedSource = normalizeSourceFromServer(createResponse.item);
      }
      setSources((prev) =>
        prev.map((source) => (getDocumentId(source) === sourceId ? storedSource : source))
      );
      setSourceRevisions((prev) => ({
        ...prev,
        [sourceId]: getDocumentRevision(storedSource),
      }));
      setConflictState(null);
      setSyncMessage("Source saved to server.");
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 409) {
        const id =
          workspaceTab === "curriculum"
            ? getDocumentId(selectedBook ?? {})
            : getDocumentId(selectedSource ?? {});
        setConflictState({
          kind: workspaceTab === "curriculum" ? "book" : "source",
          id,
          message: apiError.message || "Conflict detected. Local edits are kept.",
        });
        setSyncError("Conflict detected. Local edits are kept until you reload explicitly.");
        return;
      }
      setSyncError(formatApiError(apiError, "Failed to save to server."));
      if (workspaceTab === "curriculum") {
        setCurriculumSaveStatus("error");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReloadConflictDocument = async () => {
    if (!conflictState) return;
    setIsSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      if (conflictState.kind === "book") {
        const response = await listBooks({ sort: "updatedAt_desc", limit: 200 });
        const raw = response.items.find((item) => getDocumentId(item) === conflictState.id);
        if (raw) {
          const book = normalizeBookFromServer(raw);
          curriculumSnapshotRef.current[conflictState.id] = stableStringifyBookForSnapshot(
            normalizeBookForSave(book)
          );
          setBooks((prev) => prev.map((item) => (getDocumentId(item) === conflictState.id ? book : item)));
          setBookRevisions((prev) => ({
            ...prev,
            [conflictState.id]: getDocumentRevision(book),
          }));
          setCurriculumSaveStatus("saved");
        }
      } else {
        const response = await listSources({ sort: "updatedAt_desc", limit: 400 });
        const source = response.items.find((item) => getDocumentId(item) === conflictState.id);
        if (source) {
          setSources((prev) =>
            prev.map((item) => (getDocumentId(item) === conflictState.id ? source : item))
          );
          setSourceRevisions((prev) => ({
            ...prev,
            [conflictState.id]: getDocumentRevision(source),
          }));
        }
      }
      setConflictState(null);
      setSyncMessage("Reloaded server version after conflict.");
    } catch (error) {
      const apiError = error as ApiError;
      setSyncError(formatApiError(apiError, "Failed to reload conflict document."));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchStepPlayback = async () => {
    if (!selectedStepId || !selectedBookId || !selectedLessonId) return;
    setPlaybackError("");
    setPlaybackMessage("");
    try {
      const response = await getStepPlayback(selectedStepId, {
        bookId: selectedBookId,
        lessonId: selectedLessonId,
        lang: editorLanguage,
        requiredLanguage: ["en"],
      });
      const item =
        response &&
        typeof response === "object" &&
        "item" in response &&
        typeof (response as { item?: unknown }).item === "object" &&
        (response as { item?: unknown }).item !== null
          ? (response as { item: { nodes?: unknown[] } }).item
          : null;
      const nodeCount = Array.isArray(item?.nodes) ? item.nodes.length : 0;
      if (!item) {
        setPlaybackError("Playback response did not include a valid payload item.");
        return;
      }
      setPlaybackMessage(
        `Playback payload loaded (${nodeCount} nodes).`
      );
    } catch (error) {
      const apiError = error as ApiError;
      if (selectedLesson?.authoringV2) {
        const local = buildLocalAuthoringPlaybackFallback({
          lesson: selectedLesson,
          stepId: selectedStepId,
          bookId: selectedBookId,
          language: editorLanguage,
        });
        const nodeCount =
          local.validation?.runtimeKind === "line"
            ? local.validation.acceptedLines?.[0]?.moves.length ?? 0
            : 0;
        setPlaybackMessage(`Local fallback playback built (${nodeCount} runtime moves).`);
        return;
      }
      setPlaybackError(formatApiError(apiError, "Failed to fetch playback payload."));
    }
  };

  const handleCheckMissingTranslations = () => {
    if (!selectedBook) {
      console.log("[i18n] missing localized texts", []);
      setSyncError("No selected book to scan for missing translations.");
      setSyncMessage("");
      return;
    }
    const result = findMissingLocalizedTexts(normalizeBookForSave(selectedBook), [
      "en",
      "nl",
    ]);
    console.log("[i18n] missing localized texts", result);
    setSyncError("");
    setSyncMessage(
      result.length > 0
        ? editorLanguage === "nl"
          ? `Ontbrekende vertalingen gevonden: ${result.length}. Zie browserconsole voor details.`
          : `Missing translations found: ${result.length}. See browser console for details.`
        : editorLanguage === "nl"
        ? "Geen ontbrekende vertalingen gevonden in het huidige boek."
        : "No missing translations found in current book."
    );
  };

  const handleExportMissingTexts = () => {
    if (!selectedBook) {
      console.log("[i18n] export missing texts", []);
      return;
    }
    const result = exportMissingTexts(normalizeBookForSave(selectedBook), [
      "en",
      "nl",
    ]);
    console.log("[i18n] export missing texts", result);
  };

  const handleApplyImportedTranslations = () => {
    if (!selectedBook) {
      setSyncError("No selected book for translation import.");
      setSyncMessage("");
      return;
    }
    const raw = translationsImportJson.trim();
    if (!raw) {
      setSyncError("Paste translation JSON first.");
      setSyncMessage("");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("Translation payload must be an array.");
      }
      const safeBook = normalizeBookForSave(selectedBook);
      const updatedBook = applyTranslatedTexts(safeBook, parsed);
      const bookId = getDocumentId(safeBook);
      setBooks((prev) =>
        prev.map((book) => (getDocumentId(book) === bookId ? updatedBook : book))
      );
      setSyncError("");
      setSyncMessage("Imported translations applied to current book.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON payload.";
      setSyncError(`Failed to apply imported translations: ${message}`);
      setSyncMessage("");
    }
  };

  const handleCreateBook = () => {
    const book = createEmptyBook();
    const lesson = book.lessons[0]!;
    lesson.variantId = activeVariant;
    const firstStepId =
      lesson.authoringV2?.authoringLesson.stepIds[0] ?? lesson.steps[0]?.id ?? null;

    setBooks((prev) => [...prev, book]);
    setSelectedBookId(book.id);
    setSelectedLessonId(lesson.id);
    setSelectedStepId(firstStepId);
    setWorkspaceTab("curriculum");
  };

  const handleDeleteBook = (bookId: string) => {
    setBooks((prev) => prev.filter((book) => book.id !== bookId));
  };

  const handleCreateLesson = () => {
    if (!selectedBookId) return;

    const lesson = createEmptyLesson(selectedBookId);
    lesson.variantId = activeVariant;
    const firstStepId =
      lesson.authoringV2?.authoringLesson.stepIds[0] ?? lesson.steps[0]?.id ?? null;

    updateSelectedBook((book) => ({
      ...book,
      lessons: [...book.lessons, lesson],
    }));

    setSelectedLessonId(lesson.id);
    setSelectedStepId(firstStepId);
    setWorkspaceTab("curriculum");
  };

  const handleDeleteLesson = (lessonId: string) => {
    if (!selectedBookId) return;

    updateSelectedBook((book) => ({
      ...book,
      lessons: book.lessons.filter((lesson) => lesson.id !== lessonId),
    }));
  };

  const handleImportAuthoringFromSource = (args: {
    sourceId: string;
    startNodeId: string;
    endNodeId: string;
    importTarget: "showMoves" | "showLine" | "askSequence";
    importMode: "singleStep" | "stepPerMove";
    includeVariationsAsBranches: boolean;
    lineNodeIds?: string[];
    lineMode?: "mainline" | "variation" | "custom";
  }) => {
    const source = sources.find((s) => s.id === args.sourceId);
    if (!source || !selectedLessonId) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const map = new Map(source.nodes.map((n) => [n.id, n] as const));
      const root = map.get(source.rootNodeId);
      if (!root) return lesson;

      const preferredLine = (args.lineNodeIds ?? [])
        .map((id) => map.get(id))
        .filter((n): n is SourceDocument["nodes"][number] => !!n);
      const mainline: SourceDocument["nodes"] = [];
      let cur: SourceDocument["nodes"][number] | undefined = root;
      while (cur) {
        const next: SourceDocument["nodes"][number] | undefined = (cur.childrenIds ?? [])
          .map((id) => map.get(id))
          .filter((n): n is SourceDocument["nodes"][number] => !!n)
          .sort((a, b) => {
            const aMain = a.isMainline !== false ? 0 : 1;
            const bMain = b.isMainline !== false ? 0 : 1;
            if (aMain !== bMain) return aMain - bMain;
            return a.plyIndex - b.plyIndex;
          })[0];
        if (!next) break;
        mainline.push(next);
        cur = next;
      }
      const workingLine = preferredLine.length > 0 ? preferredLine : mainline;
      const si = workingLine.findIndex((n) => n.id === args.startNodeId);
      const ei = workingLine.findIndex((n) => n.id === args.endNodeId);
      if (si < 0 || ei < 0) return lesson;
      const from = Math.min(si, ei);
      const to = Math.max(si, ei);
      const selected = workingLine.slice(from, to + 1);
      if (selected.length === 0) return lesson;

      const lid = lesson.lessonId ?? lesson.id;
      const selectedStep = selectedStepId
        ? lesson.authoringV2.stepsById[selectedStepId]
        : null;
      const insertAfterId = selectedStep?.id ?? lesson.authoringV2.authoringLesson.stepIds.at(-1) ?? null;
      const beforeStartFen =
        (selected[0]?.parentId ? map.get(selected[0].parentId)?.fenAfter : null) ??
        source.initialFen;
      const beforeSide = (selected[0]?.move?.side ?? "W") === "W" ? "white" : "black";

      const buildShowMove = (
        node: SourceDocument["nodes"][number],
        positionFen: string
      ): StepMoment => {
        const m = createMoment("showMove");
        const path =
          node.move?.path && node.move.path.length >= 2
            ? [...node.move.path]
            : node.move?.from != null && node.move?.to != null
            ? [node.move.from, node.move.to]
            : [];
        const captures = node.move?.captures?.length ? [...node.move.captures] : undefined;
        return {
          ...m,
          title: createLocalizedText(node.move?.notation ?? "Move", node.move?.notation ?? "Zet"),
          positionRef: { type: "fen", fen: positionFen },
          moveRef:
            path.length >= 2
              ? {
                  type: "inline",
                  from: path[0]!,
                  to: path[path.length - 1]!,
                  path: path.length > 2 ? path : undefined,
                  captures,
                  side: node.move?.side === "B" ? "black" : "white",
                }
              : undefined,
        };
      };
      const toMoveRef = (node: SourceDocument["nodes"][number]): MoveReference | null => {
        const path =
          node.move?.path && node.move.path.length >= 2
            ? [...node.move.path]
            : node.move?.from != null && node.move?.to != null
              ? [node.move.from, node.move.to]
              : [];
        if (path.length < 2) return null;
        return {
          type: "inline" as const,
          from: path[0]!,
          to: path[path.length - 1]!,
          path: path.length > 2 ? path : undefined,
          captures: node.move?.captures?.length ? [...node.move.captures] : undefined,
          side: node.move?.side === "B" ? "black" : "white",
        };
      };
      const notationFromMoveRef = (mv: MoveReference): string => {
        if (mv.type !== "inline") return "?";
        const isCapture = (mv.captures?.length ?? 0) > 0 || ((mv.path?.length ?? 0) > 2);
        return `${mv.from}${isCapture ? "x" : "-"}${mv.to}`;
      };

      const toExpectedMoveSpec = (node: SourceDocument["nodes"][number]) => {
        const path =
          node.move?.path && node.move.path.length >= 2
            ? [...node.move.path]
            : node.move?.from != null && node.move?.to != null
              ? [node.move.from, node.move.to]
              : [];
        if (path.length < 2) return null;
        return {
          from: path[0]!,
          to: path[path.length - 1]!,
          path: path.length > 2 ? path : undefined,
          captures: node.move?.captures?.length ? [...node.move.captures] : undefined,
        };
      };

      const buildBranchFromVariation = (
        startNode: SourceDocument["nodes"][number],
        parentFen: string,
        mode: "showMoves" | "showLine"
      ): { branch: LessonBranch; link: StepMoment } => {
        const branchId = crypto.randomUUID();
        const line: SourceDocument["nodes"] = [];
        let c: SourceDocument["nodes"][number] | undefined = startNode;
        while (c) {
          line.push(c);
          const next: SourceDocument["nodes"][number] | undefined = (c.childrenIds ?? [])
            .map((id) => map.get(id))
            .filter((n): n is SourceDocument["nodes"][number] => !!n)
            .sort((a, b) => {
              const aMain = a.isMainline !== false ? 0 : 1;
              const bMain = b.isMainline !== false ? 0 : 1;
              if (aMain !== bMain) return aMain - bMain;
              return a.plyIndex - b.plyIndex;
            })[0];
          c = next;
        }
        const tl: StepMoment[] = [];
        if (mode === "showLine") {
          const lineMoment = createMoment("showLine");
          const moves = line
            .map((n) => toMoveRef(n))
            .filter((m): m is NonNullable<ReturnType<typeof toMoveRef>> => !!m);
          const preview = moves.slice(0, 6).map(notationFromMoveRef).join(" ");
          tl.push({
            ...lineMoment,
            title: createLocalizedText("Variation line", "Variantenlijn"),
            body: createLocalizedText(preview, preview),
            positionRef: { type: "fen", fen: parentFen },
            lineRef: {
              type: "inline",
              moves,
            },
          });
        } else {
          let fen = parentFen;
          line.forEach((n) => {
            tl.push(buildShowMove(n, fen));
            fen = n.fenAfter;
          });
        }
        const branch: LessonBranch = {
          id: branchId,
          lessonId: lid,
          title: createLocalizedText(
            `Variation: ${startNode.move?.notation ?? "line"}`,
            `Variant: ${startNode.move?.notation ?? "lijn"}`
          ),
          timeline: tl,
          initialState: {
            fen: parentFen,
            sideToMove: startNode.move?.side === "B" ? "black" : "white",
            variantId: source.variantId,
            rulesetId: source.rulesetId,
          },
          authoringMode: "stepSequence",
          authoringReturnPolicy: { type: "resumeNextMoment" },
        };
        const link = createEnterBranchLinkMoment(branchId, {
          mode: "stepSequence",
          returnPolicy: { type: "resumeNextMoment" },
        });
        return { branch, link };
      };

      const makeStep = (
        nodes: SourceDocument["nodes"],
        title: string
      ): { step: AuthoringLessonStep; branches: Record<string, LessonBranch> } => {
        const sid = crypto.randomUUID();
        const intro = createMoment("introText");
        const timeline: StepMoment[] = [
          {
            ...intro,
            title: createLocalizedText(title, title),
            body: createLocalizedText(
              readLocalizedText(source.title, editorLanguage),
              readLocalizedText(source.title, editorLanguage)
            ),
          },
        ];
        let fen = beforeStartFen;
        const branches: Record<string, LessonBranch> = {};
        const collectVariationLinks = () => {
          if (!args.includeVariationsAsBranches) return;
          let branchFen = beforeStartFen;
          nodes.forEach((n) => {
            const children = (n.childrenIds ?? [])
              .map((id) => map.get(id))
              .filter((c): c is SourceDocument["nodes"][number] => !!c);
            const varKids = children.filter((c) => c.isMainline === false);
            varKids.forEach((vk) => {
              const vb = buildBranchFromVariation(
                vk,
                branchFen,
                args.importTarget === "showLine" ? "showLine" : "showMoves"
              );
              branches[vb.branch.id] = vb.branch;
              timeline.push(vb.link);
            });
            branchFen = n.fenAfter;
          });
        };
        if (args.importTarget === "askSequence") {
          const expectedSequence = nodes
            .map((n) => toExpectedMoveSpec(n))
            .filter((m): m is NonNullable<ReturnType<typeof toExpectedMoveSpec>> => !!m);
          const ask = createMoment("askSequence");
          timeline.push({
            ...ask,
            title: createLocalizedText("Play the sequence", "Speel de sequence"),
            body: createLocalizedText(
              "Play the imported line in the right order.",
              "Speel de geimporteerde lijn in de juiste volgorde."
            ),
            interaction: {
              kind: "askSequence",
              expectedSequence,
              requireExactOrder: true,
              allowRetry: true,
              maxAttempts: 1,
            },
          });
          collectVariationLinks();
        } else if (args.importTarget === "showLine") {
          const m = createMoment("showLine");
          const moves = nodes
            .map((n) => toMoveRef(n))
            .filter((mv): mv is NonNullable<ReturnType<typeof toMoveRef>> => !!mv);
          const preview = moves.slice(0, 8).map(notationFromMoveRef).join(" ");
          timeline.push({
            ...m,
            title: createLocalizedText("Imported line", "Geimporteerde lijn"),
            body: createLocalizedText(preview, preview),
            positionRef: { type: "fen", fen: beforeStartFen },
            lineRef: {
              type: "inline",
              moves,
            },
          });
          collectVariationLinks();
        } else {
          nodes.forEach((n) => {
            timeline.push(buildShowMove(n, fen));
            if (args.includeVariationsAsBranches) {
              const children = (n.childrenIds ?? [])
                .map((id) => map.get(id))
                .filter((c): c is SourceDocument["nodes"][number] => !!c);
              const varKids = children.filter((c) => c.isMainline === false);
              varKids.forEach((vk) => {
                const vb = buildBranchFromVariation(vk, fen, "showMoves");
                branches[vb.branch.id] = vb.branch;
                timeline.push(vb.link);
              });
            }
            fen = n.fenAfter;
          });
        }
        const step: AuthoringLessonStep = {
          id: sid,
          lessonId: lid,
          kind: args.importTarget === "askSequence" ? "trySequence" : "demo",
          orderIndex: 0,
          title: createLocalizedText(title, title),
          initialState: {
            fen: beforeStartFen,
            sideToMove: beforeSide,
            variantId: source.variantId,
            rulesetId: source.rulesetId,
          },
          timeline,
          sourceRef: { sourceId: source.id },
        };
        return { step, branches };
      };

      const imported =
        args.importTarget === "askSequence" || args.importMode === "singleStep"
          ? [makeStep(selected, `${readLocalizedText(source.title, editorLanguage)} (import)`)]
          : selected.map((n) =>
              makeStep([n], `${n.move?.notation ?? "move"} · ${readLocalizedText(source.title, editorLanguage)}`)
            );

      const prev = lesson.authoringV2;
      const stepIds = [...prev.authoringLesson.stepIds];
      const stepsById = { ...prev.stepsById };
      const branchesById = { ...(prev.branchesById ?? {}) } as Record<string, LessonBranch>;
      let insertIdx = insertAfterId ? stepIds.indexOf(insertAfterId) + 1 : stepIds.length;
      if (insertIdx < 0) insertIdx = stepIds.length;
      imported.forEach(({ step: s, branches }) => {
        stepIds.splice(insertIdx, 0, s.id);
        insertIdx += 1;
        stepsById[s.id] = s;
        Object.assign(branchesById, branches);
      });
      stepIds.forEach((id, idx) => {
        const s = stepsById[id];
        if (s) stepsById[id] = { ...s, orderIndex: idx };
      });
      const next = {
        ...prev,
        authoringLesson: {
          ...prev.authoringLesson,
          stepIds,
          entryStepId: prev.authoringLesson.entryStepId ?? stepIds[0] ?? prev.authoringLesson.id,
        },
        stepsById,
        branchesById: Object.keys(branchesById).length ? branchesById : undefined,
      };
      const lastId = imported.at(-1)?.step.id ?? null;
      if (lastId) setSelectedStepId(lastId);
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
    });
  };

  const handleUpdateStep = (nextStep: LessonStep) => {
    updateSelectedLesson((lesson) => {
      const base = {
        ...lesson,
        steps: lesson.steps.map((step) =>
          step.id === nextStep.id ? nextStep : step
        ),
      };
      if (!lesson.authoringV2?.stepsById[nextStep.id]) return base;
      const a = lesson.authoringV2.stepsById[nextStep.id]!;
      let merged: AuthoringLessonStep = {
        ...a,
        initialState: {
          ...a.initialState,
          fen: nextStep.initialState.fen,
          sideToMove: nextStep.initialState.sideToMove,
        },
      };
      if (selectedMomentId) {
        const overlays = stepPresentationToMomentOverlays(nextStep);
        const nextTimeline = merged.timeline.map((m) =>
          m.id === selectedMomentId && m.type === "focusBoard"
            ? {
                ...m,
                positionRef: nextStep.initialState.fen
                  ? ({ type: "fen", fen: nextStep.initialState.fen } as const)
                  : m.positionRef,
                overlays: overlays.length > 0 ? overlays : undefined,
              }
            : m
        );
        merged = { ...merged, timeline: nextTimeline };
      }
      return syncLessonLegacyStepsFromAuthoring({
        ...base,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: { ...lesson.authoringV2.stepsById, [merged.id]: merged },
        },
      });
    });
  };

  const handleAuthoringTimelineChange = (nextTimeline: StepMoment[]) => {
    if (!selectedLessonId || !selectedStepId) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const a = lesson.authoringV2.stepsById[selectedStepId];
      if (!a) return lesson;
      const merged = { ...a, timeline: nextTimeline };
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: merged,
          },
        },
      });
    });
  };

  const handleRenameAuthoringStepTitle = (stepId: string, title: string) => {
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const a = lesson.authoringV2.stepsById[stepId];
      if (!a) return lesson;
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [stepId]: {
              ...a,
              title: writeLocalizedText(a.title ?? createLocalizedText("", ""), editorLanguage, title),
            },
          },
        },
      });
    });
  };

  const applyAuthoringSelectedMoment = (next: StepMoment) => {
    if (!selectedLessonId || !selectedStepId || !selectedMomentId) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const a = lesson.authoringV2.stepsById[selectedStepId];
      if (!a) return lesson;
      const tl = a.timeline.map((m) => (m.id === selectedMomentId ? next : m));
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...a, timeline: tl },
          },
        },
      });
    });
  };

  const applyAuthoringSelectedBranchMoment = (next: StepMoment) => {
    if (!authoringInspectedBranchId || !selectedBranchMomentId) return;
    const bid = authoringInspectedBranchId;
    const mid = selectedBranchMomentId;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const br = lesson.authoringV2.branchesById?.[bid];
      if (!br?.timeline) return lesson;
      const tl = br.timeline.map((m) => (m.id === mid ? next : m));
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          branchesById: {
            ...(lesson.authoringV2.branchesById ?? {}),
            [bid]: { ...br, timeline: tl },
          },
        },
      });
    });
  };

  const handleAuthoringTargetSquareToggle = (sq: number) => {
    setAuthoringStudioSquareSelection((prev) =>
      prev.includes(sq) ? prev.filter((x) => x !== sq) : sortUniqueSquares([...prev, sq])
    );
  };

  const handleAuthoringTargetPickMode = (active: boolean) => {
    setAuthoringBoardTargetPickMode(active);
    if (!active) setAuthoringStudioSquareSelection([]);
  };

  const handleCopyAuthoringTargetSquares = () => {
    const m = authoringInspectedBranchId ? selectedBranchAuthoringMoment : selectedAuthoringMoment;
    if (!m) return;
    const ix = m.interaction;
    if (ix?.kind !== "askSelectSquares" && ix?.kind !== "askSelectPieces") return;
    const ts =
      ix.kind === "askSelectSquares" || ix.kind === "askSelectPieces"
        ? (ix.targetSquares ?? [])
        : [];
    setAuthoringTargetSquaresClip(normalizeClip(ts));
  };

  const handlePasteAuthoringTargetSquares = () => {
    if (authoringTargetSquaresClip == null) return;
    const clip = normalizeClip(authoringTargetSquaresClip);
    if (authoringInspectedBranchId && selectedBranchAuthoringMoment) {
      const m = selectedBranchAuthoringMoment;
      const ix = m.interaction;
      if (ix?.kind !== "askSelectSquares" && ix?.kind !== "askSelectPieces") return;
      applyAuthoringSelectedBranchMoment({
        ...m,
        interaction: { ...ix, targetSquares: clip },
      });
      return;
    }
    if (selectedAuthoringMoment) {
      const m = selectedAuthoringMoment;
      const ix = m.interaction;
      if (ix?.kind !== "askSelectSquares" && ix?.kind !== "askSelectPieces") return;
      applyAuthoringSelectedMoment({
        ...m,
        interaction: { ...ix, targetSquares: clip },
      });
    }
  };

  const handleUsePreviewCountFromPreview = () => {
    const n = parsePreviewCountDraft(authoringAskCountPreviewDraft);
    if (n == null) return;
    if (
      authoringInspectedBranchId &&
      selectedBranchAuthoringMoment?.type === "askCount" &&
      selectedBranchAuthoringMoment.interaction?.kind === "askCount"
    ) {
      applyAuthoringSelectedBranchMoment({
        ...selectedBranchAuthoringMoment,
        interaction: { ...selectedBranchAuthoringMoment.interaction, correctValue: n },
      });
      return;
    }
    if (
      selectedAuthoringMoment?.type === "askCount" &&
      selectedAuthoringMoment.interaction?.kind === "askCount"
    ) {
      applyAuthoringSelectedMoment({
        ...selectedAuthoringMoment,
        interaction: { ...selectedAuthoringMoment.interaction, correctValue: n },
      });
    }
  };

  const handleCopyPlacePiecesPlacement = () => {
    const m = authoringInspectedBranchId ? selectedBranchAuthoringMoment : selectedAuthoringMoment;
    if (!m || m.type !== "placePieces" || m.interaction?.kind !== "placePieces") return;
    setAuthoringPlacePiecesClip(normalizePlacePiecesClip(m.interaction.expectedPlacement));
  };

  const handlePastePlacePiecesPlacement = () => {
    if (authoringPlacePiecesClip == null) return;
    const clip = normalizePlacePiecesClip(authoringPlacePiecesClip);
    if (
      authoringInspectedBranchId &&
      selectedBranchAuthoringMoment?.type === "placePieces" &&
      selectedBranchAuthoringMoment.interaction?.kind === "placePieces"
    ) {
      const m = selectedBranchAuthoringMoment;
      const ix = m.interaction;
      applyAuthoringSelectedBranchMoment({
        ...m,
        interaction: { ...ix, kind: "placePieces" as const, expectedPlacement: clip },
      });
      return;
    }
    if (
      selectedAuthoringMoment?.type === "placePieces" &&
      selectedAuthoringMoment.interaction?.kind === "placePieces"
    ) {
      const m = selectedAuthoringMoment;
      const ix = m.interaction;
      applyAuthoringSelectedMoment({
        ...m,
        interaction: { ...ix, kind: "placePieces" as const, expectedPlacement: clip },
      });
    }
  };

  const handleLoadPlacePiecesTargetIntoPreview = () => {
    const m = authoringInspectedBranchId ? selectedBranchAuthoringMoment : selectedAuthoringMoment;
    if (!m || m.type !== "placePieces" || m.interaction?.kind !== "placePieces") return;
    const slots = normalizePlacePiecesClip(m.interaction.expectedPlacement);
    setPlacePiecesPreviewLoadRequest({ key: Date.now(), slots });
  };

  const handleUsePreviewBoardAsPlacePiecesTarget = () => {
    const get = placePiecesPreviewBoardGetterRef.current;
    if (!get) return;
    const board = get();
    if (!board) return;
    const slots = boardStateToExpectedPlacement(board);
    if (
      authoringInspectedBranchId &&
      selectedBranchAuthoringMoment?.type === "placePieces" &&
      selectedBranchAuthoringMoment.interaction?.kind === "placePieces"
    ) {
      const m = selectedBranchAuthoringMoment;
      const ix = m.interaction;
      applyAuthoringSelectedBranchMoment({
        ...m,
        interaction: { ...ix, kind: "placePieces" as const, expectedPlacement: slots },
      });
      return;
    }
    if (
      selectedAuthoringMoment?.type === "placePieces" &&
      selectedAuthoringMoment.interaction?.kind === "placePieces"
    ) {
      const m = selectedAuthoringMoment;
      const ix = m.interaction;
      applyAuthoringSelectedMoment({
        ...m,
        interaction: { ...ix, kind: "placePieces" as const, expectedPlacement: slots },
      });
    }
  };

  const authoringSelectComfortProps = {
    studioSelection: authoringStudioSquareSelection,
    targetPickMode: authoringBoardTargetPickMode,
    onTargetPickModeChange: handleAuthoringTargetPickMode,
    hasTargetClip: authoringTargetSquaresClip != null,
    onCopyTargets: handleCopyAuthoringTargetSquares,
    onPasteTargets: handlePasteAuthoringTargetSquares,
  };

  const authoringAskCountComfortProps = {
    previewCountDraft: authoringAskCountPreviewDraft,
    onUsePreviewCountFromPreview: handleUsePreviewCountFromPreview,
  };

  const authoringPlacePiecesComfortProps = {
    hasPlacementClip: authoringPlacePiecesClip != null,
    onCopyPlacement: handleCopyPlacePiecesPlacement,
    onPastePlacement: handlePastePlacePiecesPlacement,
    onLoadTargetIntoPreview: handleLoadPlacePiecesTargetIntoPreview,
    onUsePreviewBoardAsTarget: handleUsePreviewBoardAsPlacePiecesTarget,
  };

  const handleCopyAuthoringPresentationRuntime = () => {
    if (!authoringPresentationMoment) return;
    const clip = extractPresentationRuntimeClip(authoringPresentationMoment);
    setAuthoringPresentationRuntimeClip(
      hasAnyPresentationRuntimeClip(clip) ? clip : null
    );
  };

  const handlePasteAuthoringPresentationRuntime = () => {
    if (!authoringPresentationMoment || !authoringPresentationRuntimeClip) return;
    if (!hasAnyPresentationRuntimeClip(authoringPresentationRuntimeClip)) return;
    const next = mergePresentationRuntimeClip(
      authoringPresentationMoment,
      authoringPresentationRuntimeClip
    );
    if (authoringInspectedBranchId) {
      applyAuthoringSelectedBranchMoment(next);
    } else {
      applyAuthoringSelectedMoment(next);
    }
  };

  const handleAppendAuthoringMomentsFromRecording = (moments: StepMoment[]) => {
    if (!selectedLessonId || !selectedStepId || moments.length === 0) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const a = lesson.authoringV2.stepsById[selectedStepId];
      if (!a) return lesson;
      const prev = a.timeline ?? [];
      const merged = { ...a, timeline: [...prev, ...moments] };
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: merged,
          },
        },
      });
    });
  };

  const handleApplyRecordingToSelectedAskSequence = useCallback(
    (moves: RecordedMove[]) => {
      if (moves.length === 0) return;
      const specs = recordedMovesToExpectedSequenceSpecs(moves);
      updateSelectedLesson((lesson) => {
        if (!lesson.authoringV2) return lesson;
        if (authoringInspectedBranchId && selectedBranchMomentId) {
          const bid = authoringInspectedBranchId;
          const br = lesson.authoringV2.branchesById?.[bid];
          if (!br?.timeline) return lesson;
          const m = br.timeline.find((x) => x.id === selectedBranchMomentId);
          if (!m || m.type !== "askSequence" || m.interaction?.kind !== "askSequence") {
            return lesson;
          }
          const nextMoment: StepMoment = {
            ...m,
            interaction: { ...m.interaction, expectedSequence: specs },
          };
          const tl = br.timeline.map((x) => (x.id === selectedBranchMomentId ? nextMoment : x));
          return syncLessonLegacyStepsFromAuthoring({
            ...lesson,
            authoringV2: {
              ...lesson.authoringV2,
              branchesById: {
                ...(lesson.authoringV2.branchesById ?? {}),
                [bid]: { ...br, timeline: tl },
              },
            },
          });
        }
        if (!selectedStepId || !selectedMomentId) return lesson;
        const a = lesson.authoringV2.stepsById[selectedStepId];
        if (!a?.timeline) return lesson;
        const m = a.timeline.find((x) => x.id === selectedMomentId);
        if (!m || m.type !== "askSequence" || m.interaction?.kind !== "askSequence") {
          return lesson;
        }
        const nextMoment: StepMoment = {
          ...m,
          interaction: { ...m.interaction, expectedSequence: specs },
        };
        const tl = a.timeline.map((x) => (x.id === selectedMomentId ? nextMoment : x));
        return syncLessonLegacyStepsFromAuthoring({
          ...lesson,
          authoringV2: {
            ...lesson.authoringV2,
            stepsById: {
              ...lesson.authoringV2.stepsById,
              [selectedStepId]: { ...a, timeline: tl },
            },
          },
        });
      });
    },
    [
      authoringInspectedBranchId,
      selectedBranchMomentId,
      selectedStepId,
      selectedMomentId,
      updateSelectedLesson,
    ]
  );

  const handleAppendRecordingToSelectedAskSequence = useCallback(
    (moves: RecordedMove[]) => {
      if (moves.length === 0) return;
      const specs = recordedMovesToExpectedSequenceSpecs(moves);
      updateSelectedLesson((lesson) => {
        if (!lesson.authoringV2) return lesson;
        if (authoringInspectedBranchId && selectedBranchMomentId) {
          const bid = authoringInspectedBranchId;
          const br = lesson.authoringV2.branchesById?.[bid];
          if (!br?.timeline) return lesson;
          const m = br.timeline.find((x) => x.id === selectedBranchMomentId);
          if (!m || m.type !== "askSequence" || m.interaction?.kind !== "askSequence") {
            return lesson;
          }
          const prev = m.interaction.expectedSequence ?? [];
          const nextMoment: StepMoment = {
            ...m,
            interaction: { ...m.interaction, expectedSequence: [...prev, ...specs] },
          };
          const tl = br.timeline.map((x) => (x.id === selectedBranchMomentId ? nextMoment : x));
          return syncLessonLegacyStepsFromAuthoring({
            ...lesson,
            authoringV2: {
              ...lesson.authoringV2,
              branchesById: {
                ...(lesson.authoringV2.branchesById ?? {}),
                [bid]: { ...br, timeline: tl },
              },
            },
          });
        }
        if (!selectedStepId || !selectedMomentId) return lesson;
        const a = lesson.authoringV2.stepsById[selectedStepId];
        if (!a?.timeline) return lesson;
        const m = a.timeline.find((x) => x.id === selectedMomentId);
        if (!m || m.type !== "askSequence" || m.interaction?.kind !== "askSequence") {
          return lesson;
        }
        const prev = m.interaction.expectedSequence ?? [];
        const nextMoment: StepMoment = {
          ...m,
          interaction: { ...m.interaction, expectedSequence: [...prev, ...specs] },
        };
        const tl = a.timeline.map((x) => (x.id === selectedMomentId ? nextMoment : x));
        return syncLessonLegacyStepsFromAuthoring({
          ...lesson,
          authoringV2: {
            ...lesson.authoringV2,
            stepsById: {
              ...lesson.authoringV2.stepsById,
              [selectedStepId]: { ...a, timeline: tl },
            },
          },
        });
      });
    },
    [
      authoringInspectedBranchId,
      selectedBranchMomentId,
      selectedStepId,
      selectedMomentId,
      updateSelectedLesson,
    ]
  );

  const applyRecordingToAskSequenceEnabled = useMemo(() => {
    if (!selectedLesson?.authoringV2) return false;
    if (authoringInspectedBranchId) {
      return (
        selectedBranchAuthoringMoment?.type === "askSequence" &&
        selectedBranchAuthoringMoment?.interaction?.kind === "askSequence"
      );
    }
    return (
      selectedAuthoringMoment?.type === "askSequence" &&
      selectedAuthoringMoment?.interaction?.kind === "askSequence"
    );
  }, [
    selectedLesson?.authoringV2,
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment,
    selectedAuthoringMoment,
  ]);

  const applyRecordingToPlacePiecesEnabled = useMemo(() => {
    if (!selectedLesson?.authoringV2) return false;
    if (authoringInspectedBranchId) {
      return (
        selectedBranchAuthoringMoment?.type === "placePieces" &&
        selectedBranchAuthoringMoment?.interaction?.kind === "placePieces"
      );
    }
    return (
      selectedAuthoringMoment?.type === "placePieces" &&
      selectedAuthoringMoment?.interaction?.kind === "placePieces"
    );
  }, [
    selectedLesson?.authoringV2,
    authoringInspectedBranchId,
    selectedBranchAuthoringMoment,
    selectedAuthoringMoment,
  ]);

  const handleApplyRecordingToPlacePiecesWithShowLine = useCallback(
    (moves: RecordedMove[]) => {
      if (moves.length === 0) return;
      const specs = recordedMovesToExpectedSequenceSpecs(moves);
      const lineMoves: MoveReference[] = moves.map((m) => ({
        type: "inline",
        from: m.from,
        to: m.to,
        path: m.path && m.path.length >= 2 ? m.path : undefined,
        captures: m.captures && m.captures.length > 0 ? m.captures : undefined,
      }));
      const linePreview = moves.map((m) => m.notation).join(" ");
      updateSelectedLesson((lesson) => {
        if (!lesson.authoringV2) return lesson;
        const applyRecordedLineOnPlacePieces = (m: StepMoment): StepMoment | null => {
          if (m.type !== "placePieces" || m.interaction?.kind !== "placePieces") return null;
          const startFen = m.positionRef?.type === "fen" ? m.positionRef.fen.trim() : "";
          let computedTargetFen = m.interaction.targetFen?.trim() ?? "";
          if (startFen) {
            try {
              let board = fenToBoardState(startFen);
              for (const rm of moves) {
                const em = resolveNotationToEngineMove(board, rm.notation);
                if (!em?.fenAfter) break;
                board = fenToBoardState(em.fenAfter);
              }
              computedTargetFen = boardStateToFen(board);
            } catch {
              // Keep existing target when replaying the line fails.
            }
          }
          const promptText =
            editorLanguage === "nl"
              ? `Wat is de stand na deze zetten: ${linePreview}`
              : `What is the position after these moves: ${linePreview}`;
          return {
            ...m,
            interaction: {
              ...m.interaction,
              solutionSequence: specs,
              targetFen: computedTargetFen || m.interaction.targetFen,
              prompt: writeLocalizedText(
                m.interaction.prompt ?? createLocalizedText("", ""),
                editorLanguage,
                promptText
              ),
            },
          };
        };
        if (authoringInspectedBranchId && selectedBranchMomentId) {
          const bid = authoringInspectedBranchId;
          const br = lesson.authoringV2.branchesById?.[bid];
          if (!br?.timeline) return lesson;
          const idx = br.timeline.findIndex((x) => x.id === selectedBranchMomentId);
          if (idx < 0) return lesson;
          const m = br.timeline[idx];
          const updatedPlacePieces = m ? applyRecordedLineOnPlacePieces(m) : null;
          if (!updatedPlacePieces) return lesson;
          const showLineMoment: StepMoment = {
            id: crypto.randomUUID(),
            type: "showLine",
            title: createLocalizedText("Solution line", "Oplossingslijn"),
            body: createLocalizedText(linePreview, linePreview),
            lineRef: { type: "inline", moves: lineMoves },
          };
          const tl = [...br.timeline];
          tl[idx] = updatedPlacePieces;
          tl.splice(idx + 1, 0, showLineMoment);
          return syncLessonLegacyStepsFromAuthoring({
            ...lesson,
            authoringV2: {
              ...lesson.authoringV2,
              branchesById: {
                ...(lesson.authoringV2.branchesById ?? {}),
                [bid]: { ...br, timeline: tl },
              },
            },
          });
        }
        if (!selectedStepId || !selectedMomentId) return lesson;
        const a = lesson.authoringV2.stepsById[selectedStepId];
        if (!a?.timeline) return lesson;
        const idx = a.timeline.findIndex((x) => x.id === selectedMomentId);
        if (idx < 0) return lesson;
        const m = a.timeline[idx];
        const updatedPlacePieces = m ? applyRecordedLineOnPlacePieces(m) : null;
        if (!updatedPlacePieces) return lesson;
        const showLineMoment: StepMoment = {
          id: crypto.randomUUID(),
          type: "showLine",
          title: createLocalizedText("Solution line", "Oplossingslijn"),
          body: createLocalizedText(linePreview, linePreview),
          lineRef: { type: "inline", moves: lineMoves },
        };
        const tl = [...a.timeline];
        tl[idx] = updatedPlacePieces;
        tl.splice(idx + 1, 0, showLineMoment);
        return syncLessonLegacyStepsFromAuthoring({
          ...lesson,
          authoringV2: {
            ...lesson.authoringV2,
            stepsById: {
              ...lesson.authoringV2.stepsById,
              [selectedStepId]: { ...a, timeline: tl },
            },
          },
        });
      });
    },
    [
      authoringInspectedBranchId,
      selectedBranchMomentId,
      selectedStepId,
      selectedMomentId,
      updateSelectedLesson,
    ]
  );


  const handleAppendRecordingAsNewAskMove = useCallback(
    (moves: RecordedMove[]) => {
      const moment = buildAskMoveMomentFromRecordingFirstPly(moves);
      if (!moment) return;
      updateSelectedLesson((lesson) => {
        if (!lesson.authoringV2) return lesson;
        if (authoringInspectedBranchId) {
          const br = lesson.authoringV2.branchesById?.[authoringInspectedBranchId];
          if (!br) return lesson;
          const tl = [...(br.timeline ?? []), moment];
          return syncLessonLegacyStepsFromAuthoring({
            ...lesson,
            authoringV2: {
              ...lesson.authoringV2,
              branchesById: {
                ...(lesson.authoringV2.branchesById ?? {}),
                [authoringInspectedBranchId]: { ...br, timeline: tl },
              },
            },
          });
        }
        if (!selectedStepId) return lesson;
        const a = lesson.authoringV2.stepsById[selectedStepId];
        if (!a) return lesson;
        return syncLessonLegacyStepsFromAuthoring({
          ...lesson,
          authoringV2: {
            ...lesson.authoringV2,
            stepsById: {
              ...lesson.authoringV2.stepsById,
              [selectedStepId]: { ...a, timeline: [...(a.timeline ?? []), moment] },
            },
          },
        });
      });
      if (authoringInspectedBranchId) setSelectedBranchMomentId(moment.id);
      else setSelectedMomentId(moment.id);
    },
    [authoringInspectedBranchId, selectedStepId, updateSelectedLesson]
  );

  const handleAppendRecordingAsNewAskSequence = useCallback(
    (moves: RecordedMove[]) => {
      const moment = buildAskSequenceMomentFromRecording(moves);
      if (!moment) return;
      updateSelectedLesson((lesson) => {
        if (!lesson.authoringV2) return lesson;
        if (authoringInspectedBranchId) {
          const br = lesson.authoringV2.branchesById?.[authoringInspectedBranchId];
          if (!br) return lesson;
          const tl = [...(br.timeline ?? []), moment];
          return syncLessonLegacyStepsFromAuthoring({
            ...lesson,
            authoringV2: {
              ...lesson.authoringV2,
              branchesById: {
                ...(lesson.authoringV2.branchesById ?? {}),
                [authoringInspectedBranchId]: { ...br, timeline: tl },
              },
            },
          });
        }
        if (!selectedStepId) return lesson;
        const a = lesson.authoringV2.stepsById[selectedStepId];
        if (!a) return lesson;
        return syncLessonLegacyStepsFromAuthoring({
          ...lesson,
          authoringV2: {
            ...lesson.authoringV2,
            stepsById: {
              ...lesson.authoringV2.stepsById,
              [selectedStepId]: { ...a, timeline: [...(a.timeline ?? []), moment] },
            },
          },
        });
      });
      if (authoringInspectedBranchId) setSelectedBranchMomentId(moment.id);
      else setSelectedMomentId(moment.id);
    },
    [authoringInspectedBranchId, selectedStepId, updateSelectedLesson]
  );

  const authoringTimelineMomentCount =
    selectedLesson?.authoringV2 && selectedStepId
      ? selectedLesson.authoringV2.stepsById[selectedStepId]?.timeline.length ?? 0
      : 0;

  const inspectedBranchTimelineLength =
    authoringInspectedBranchId && selectedLesson?.authoringV2
      ? selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId]?.timeline
          ?.length ?? 0
      : 0;

  const wholeMomentCanPaste = wholeMomentClipboard != null;

  const handleAuthoringSplitAtSelectedMoment = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const step = selectedLesson.authoringV2.stepsById[selectedStepId];
    if (!step) return;
    const split = splitStepAtMoment(step, selectedMomentId);
    if (!split) return;
    const newStepId = split.newStep.id;
    const firstMomentId = split.newStep.timeline[0]?.id ?? null;
    const lid = selectedLesson.lessonId ?? selectedLesson.id;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const sp = splitStepAtMoment(st, selectedMomentId);
      if (!sp) return lesson;
      let b = {
        ...lesson.authoringV2,
        stepsById: {
          ...lesson.authoringV2.stepsById,
          [sp.updatedOriginal.id]: sp.updatedOriginal,
        },
      };
      b = insertAuthoringStepAfter(b, selectedStepId, sp.newStep, lid);
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: b });
    });
    setSelectedStepId(newStepId);
    setSelectedMomentId(firstMomentId);
  };

  const handleAuthoringExtractSelectedToNewStep = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const step = selectedLesson.authoringV2.stepsById[selectedStepId];
    if (!step || step.timeline.length < 2) return;
    const ext = extractMomentsToNewStep(step, [selectedMomentId]);
    if (!ext) return;
    const newStepId = ext.newStep.id;
    const firstMomentId = ext.newStep.timeline[0]?.id ?? null;
    const lid = selectedLesson.lessonId ?? selectedLesson.id;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const ex = extractMomentsToNewStep(st, [selectedMomentId]);
      if (!ex) return lesson;
      let b = {
        ...lesson.authoringV2,
        stepsById: {
          ...lesson.authoringV2.stepsById,
          [ex.updatedOriginal.id]: ex.updatedOriginal,
        },
      };
      b = insertAuthoringStepAfter(b, selectedStepId, ex.newStep, lid);
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: b });
    });
    setSelectedStepId(newStepId);
    setSelectedMomentId(firstMomentId);
  };

  const handleAuthoringExtractSelectedToBranch = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const step = selectedLesson.authoringV2.stepsById[selectedStepId];
    if (!step || step.timeline.length < 2) return;
    const ext = extractMomentsToLessonBranch(step, [selectedMomentId]);
    if (!ext) return;
    const linkMomentId = ext.linkMomentId;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const ex = extractMomentsToLessonBranch(st, [selectedMomentId]);
      if (!ex) return lesson;
      const prevBranches = lesson.authoringV2.branchesById ?? {};
      const b = {
        ...lesson.authoringV2,
        stepsById: {
          ...lesson.authoringV2.stepsById,
          [ex.updatedOriginal.id]: ex.updatedOriginal,
        },
        branchesById: { ...prevBranches, [ex.branch.id]: ex.branch },
      };
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: b });
    });
    setAuthoringInspectedBranchId(null);
    setSelectedMomentId(linkMomentId);
  };

  const handleCopyWholeMomentFromStep = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const st = selectedLesson.authoringV2.stepsById[selectedStepId];
    const m = st?.timeline.find((x) => x.id === selectedMomentId);
    if (!m) return;
    setWholeMomentClipboard(structuredClone(m));
  };

  const handleCopyWholeMomentFromBranch = () => {
    if (!selectedLesson?.authoringV2 || !authoringInspectedBranchId || !selectedBranchMomentId) {
      return;
    }
    const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
    const m = br?.timeline?.find((x) => x.id === selectedBranchMomentId);
    if (!m) return;
    setWholeMomentClipboard(structuredClone(m));
  };

  const handlePasteWholeMomentOnStep = () => {
    if (!wholeMomentClipboard || !selectedLesson?.authoringV2 || !selectedStepId) return;
    const paste = cloneStepMomentForAuthoringDuplicate(wholeMomentClipboard);
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const nextTl = insertMomentAfter(st.timeline, selectedMomentId, paste);
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...st, timeline: nextTl },
          },
        },
      });
    });
    setSelectedMomentId(paste.id);
  };

  const handlePasteWholeMomentOnBranch = () => {
    if (!wholeMomentClipboard || !selectedLesson?.authoringV2 || !authoringInspectedBranchId) {
      return;
    }
    const bid = authoringInspectedBranchId;
    const paste = cloneStepMomentForAuthoringDuplicate(wholeMomentClipboard);
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const br = lesson.authoringV2.branchesById?.[bid];
      if (!br) return lesson;
      const tl = br.timeline ?? [];
      const nextTl = insertMomentAfter(tl, selectedBranchMomentId, paste);
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          branchesById: {
            ...(lesson.authoringV2.branchesById ?? {}),
            [bid]: { ...br, timeline: nextTl },
          },
        },
      });
    });
    setSelectedBranchMomentId(paste.id);
  };

  const handleDuplicateSelectedMomentToNewStep = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const step = selectedLesson.authoringV2.stepsById[selectedStepId];
    const orig = step?.timeline.find((m) => m.id === selectedMomentId);
    if (!step || !orig) return;
    const clone = cloneStepMomentForAuthoringDuplicate(orig);
    const newStep = buildNewStepFromTimelineTail(step, [clone], {
      title: createLocalizedText("Duplicated moment", "Gedupliceerd moment"),
    });
    const newStepId = newStep.id;
    const lid = selectedLesson.lessonId ?? selectedLesson.id;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      if (!lesson.authoringV2.stepsById[selectedStepId]) return lesson;
      const b = insertAuthoringStepAfter(lesson.authoringV2, selectedStepId, newStep, lid);
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: b });
    });
    setSelectedStepId(newStepId);
    setSelectedMomentId(clone.id);
    setAuthoringInspectedBranchId(null);
  };

  const handleDuplicateSelectedMomentToBranchWithLink = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const step = selectedLesson.authoringV2.stepsById[selectedStepId];
    const orig = step?.timeline.find((m) => m.id === selectedMomentId);
    if (!step || !orig) return;
    const clone = cloneStepMomentForAuthoringDuplicate(orig);
    const branchId = crypto.randomUUID();
    const link = createEnterBranchLinkMoment(branchId);
    const branch: LessonBranch = {
      id: branchId,
      lessonId: step.lessonId,
      title: createLocalizedText("Side line (copy)", "Zijlijn (kopie)"),
      timeline: [clone],
      initialState: deriveBranchInitialState(step.initialState, clone),
      authoringMode: "stepSequence",
      authoringReturnPolicy: { type: "resumeNextMoment" },
    };
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const nextTl = insertMomentAfter(st.timeline, selectedMomentId, link);
      const prevBranches = lesson.authoringV2.branchesById ?? {};
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...st, timeline: nextTl },
          },
          branchesById: { ...prevBranches, [branch.id]: branch },
        },
      });
    });
    setSelectedMomentId(link.id);
    setAuthoringInspectedBranchId(null);
  };

  const handleMoveSelectedBranchMomentToMainStep = () => {
    if (
      !selectedLesson?.authoringV2 ||
      !selectedStepId ||
      !authoringInspectedBranchId ||
      !selectedBranchMomentId
    ) {
      return;
    }
    const br = selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId];
    const tl = br?.timeline ?? [];
    if (tl.length <= 1) return;
    const orig = tl.find((m) => m.id === selectedBranchMomentId);
    if (!orig) return;
    const clone = cloneStepMomentForAuthoringDuplicate(orig);
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const branch = lesson.authoringV2.branchesById?.[authoringInspectedBranchId];
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!branch || !st) return lesson;
      const bTl = branch.timeline ?? [];
      if (bTl.length <= 1) return lesson;
      const nextB = bTl.filter((m) => m.id !== selectedBranchMomentId);
      const mainTl = insertMomentAfter(st.timeline, selectedMomentId, clone);
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...st, timeline: mainTl },
          },
          branchesById: {
            ...(lesson.authoringV2.branchesById ?? {}),
            [authoringInspectedBranchId]: { ...branch, timeline: nextB },
          },
        },
      });
    });
    setAuthoringInspectedBranchId(null);
    setSelectedBranchMomentId(null);
    setSelectedMomentId(clone.id);
  };

  const handleUnlinkSelectedBranchLink = () => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    const st0 = selectedLesson.authoringV2.stepsById[selectedStepId];
    const branchId = st0?.timeline.find((m) => m.id === selectedMomentId)?.branchAction
      ?.branchId;
    if (!st0 || !branchId) return;
    const nextTimeline = st0.timeline.filter((m) => m.id !== selectedMomentId);
    const nextSel = nextTimeline[0]?.id ?? null;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2 || !selectedStepId) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const tl = st.timeline.filter((m) => m.id !== selectedMomentId);
      const prev = lesson.authoringV2.branchesById ?? {};
      const { [branchId]: _removed, ...rest } = prev;
      const branchesById = Object.keys(rest).length > 0 ? rest : {};
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...st, timeline: tl },
          },
          branchesById,
        },
      });
    });
    setAuthoringInspectedBranchId(null);
    setSelectedMomentId(nextSel);
  };

  const handleApplyEditingBranch = (next: LessonBranch) => {
    const bid = authoringInspectedBranchId;
    if (!bid) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          branchesById: {
            ...(lesson.authoringV2.branchesById ?? {}),
            [bid]: { ...next, id: bid, lessonId: next.lessonId },
          },
        },
      });
    });
  };

  const handleBranchEditorTimelineChange = (nextTimeline: StepMoment[]) => {
    const bid = authoringInspectedBranchId;
    if (!bid || !selectedLesson?.authoringV2) return;
    const br = selectedLesson.authoringV2.branchesById?.[bid];
    if (!br) return;
    const merged = setBranchTimeline(br, nextTimeline);
    handleApplyEditingBranch(merged);
  };

  const handleRelinkEnterBranchMoment = (nextBranchId: string) => {
    if (!selectedLesson?.authoringV2 || !selectedStepId || !selectedMomentId) return;
    if (!selectedLesson.authoringV2.branchesById?.[nextBranchId]) return;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2 || !selectedStepId) return lesson;
      const st = lesson.authoringV2.stepsById[selectedStepId];
      if (!st) return lesson;
      const tl = st.timeline.map((m) =>
        m.id === selectedMomentId && m.branchAction
          ? { ...m, branchAction: { ...m.branchAction, branchId: nextBranchId } }
          : m
      );
      return syncLessonLegacyStepsFromAuthoring({
        ...lesson,
        authoringV2: {
          ...lesson.authoringV2,
          stepsById: {
            ...lesson.authoringV2.stepsById,
            [selectedStepId]: { ...st, timeline: tl },
          },
        },
      });
    });
  };

  const handleMoveStepUp = (stepId: string) => {
    updateSelectedLesson((lesson) => {
      if (lesson.authoringV2) {
        const lid = lesson.lessonId ?? lesson.id;
        const next = moveAuthoringStepUp(lesson.authoringV2, stepId, lid);
        if (!next) return lesson;
        return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
      }
      const index = lesson.steps.findIndex((s) => s.id === stepId);
      if (index <= 0) return lesson;

      const nextSteps = [...lesson.steps];
      [nextSteps[index - 1], nextSteps[index]] = [
        nextSteps[index]!,
        nextSteps[index - 1]!,
      ];

      return {
        ...lesson,
        steps: nextSteps,
      };
    });
  };

  const handleMoveStepDown = (stepId: string) => {
    updateSelectedLesson((lesson) => {
      if (lesson.authoringV2) {
        const lid = lesson.lessonId ?? lesson.id;
        const next = moveAuthoringStepDown(lesson.authoringV2, stepId, lid);
        if (!next) return lesson;
        return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
      }
      const index = lesson.steps.findIndex((s) => s.id === stepId);
      if (index < 0 || index >= lesson.steps.length - 1) return lesson;

      const nextSteps = [...lesson.steps];
      [nextSteps[index], nextSteps[index + 1]] = [
        nextSteps[index + 1]!,
        nextSteps[index]!,
      ];

      return {
        ...lesson,
        steps: nextSteps,
      };
    });
  };

  const handleDeleteStep = (stepId: string) => {
    let fallbackStepId: string | null = null;
    if (selectedLesson?.authoringV2) {
      const ids = selectedLesson.authoringV2.authoringLesson.stepIds.filter(
        (id) => id !== stepId
      );
      fallbackStepId = ids[0] ?? null;
    } else {
      fallbackStepId =
        selectedLesson?.steps.filter((step) => step.id !== stepId)[0]?.id ?? null;
    }

    updateSelectedLesson((lesson) => {
      if (lesson.authoringV2) {
        const lid = lesson.lessonId ?? lesson.id;
        const next = deleteAuthoringStep(lesson.authoringV2, stepId, lid);
        if (!next) return lesson;
        return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
      }
      return {
        ...lesson,
        steps: lesson.steps.filter((step) => step.id !== stepId),
      };
    });

    if (selectedStepId === stepId) {
      setSelectedStepId(fallbackStepId);
    }
  };

  const handleAuthoringInsertStepAfter = () => {
    if (!selectedLessonId) return;
    const lid = selectedLesson?.lessonId ?? selectedLessonId;
    const fresh = createDefaultAuthoringLessonStep(lid);
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const next = insertAuthoringStepAfter(
        lesson.authoringV2,
        selectedStepId,
        fresh,
        lid
      );
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
    });
    setSelectedStepId(fresh.id);
  };

  const handleAuthoringInsertStepBefore = () => {
    if (!selectedLessonId) return;
    const lid = selectedLesson?.lessonId ?? selectedLessonId;
    const fresh = createDefaultAuthoringLessonStep(lid);
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const next = insertAuthoringStepBefore(
        lesson.authoringV2,
        selectedStepId,
        fresh,
        lid
      );
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
    });
    setSelectedStepId(fresh.id);
  };

  const handleAuthoringDuplicateStep = () => {
    if (!selectedStepId || !selectedLessonId) return;
    const lid = selectedLesson?.lessonId ?? selectedLessonId;
    let newId: string | null = null;
    updateSelectedLesson((lesson) => {
      if (!lesson.authoringV2) return lesson;
      const prevIds = [...lesson.authoringV2.authoringLesson.stepIds];
      const next = duplicateAuthoringStep(lesson.authoringV2, selectedStepId, lid);
      if (!next) return lesson;
      const i = prevIds.indexOf(selectedStepId);
      newId = i >= 0 ? next.authoringLesson.stepIds[i + 1] ?? null : null;
      return syncLessonLegacyStepsFromAuthoring({ ...lesson, authoringV2: next });
    });
    if (newId) setSelectedStepId(newId);
  };

  const handleRenameBook = (title: string) => {
    updateSelectedBook((book) => ({
      ...book,
      title: writeLocalizedText(book.title, editorLanguage, title),
    }));
  };

  const handleRenameLesson = (title: string) => {
    updateSelectedLesson((lesson) => {
      const nextTitle = writeLocalizedText(lesson.title, editorLanguage, title);
      if (!lesson.authoringV2) {
        return { ...lesson, title: nextTitle };
      }
      return {
        ...lesson,
        title: nextTitle,
        authoringV2: {
          ...lesson.authoringV2,
          authoringLesson: {
            ...lesson.authoringV2.authoringLesson,
            title: nextTitle,
          },
        },
      };
    });
  };

  const handleLessonDescriptionChange = (description: string) => {
    updateSelectedLesson((lesson) => {
      const nextDesc = writeLocalizedText(
        lesson.description,
        editorLanguage,
        description
      );
      if (!lesson.authoringV2) {
        return { ...lesson, description: nextDesc };
      }
      return {
        ...lesson,
        description: nextDesc,
        authoringV2: {
          ...lesson.authoringV2,
          authoringLesson: {
            ...lesson.authoringV2.authoringLesson,
            description: nextDesc,
          },
        },
      };
    });
  };

  const handleCreateSource = () => {
    const source = createEmptySource(activeVariant);
    setSources((prev) => [...prev, source]);
    setSelectedSourceId(source.id);
    setWorkspaceTab("sources");
  };

  const handleDeleteSource = (sourceId: string) => {
    setSources((prev) => prev.filter((source) => source.id !== sourceId));
  };

  const handleRenameSource = (title: string) => {
    updateSelectedSource((source) => ({
      ...source,
      title: writeLocalizedText(source.title, editorLanguage, title),
    }));
  };

  const handleSourceDescriptionChange = (description: string) => {
    updateSelectedSource((source) => ({
      ...source,
      description: writeLocalizedText(source.description, editorLanguage, description),
    }));
  };

  const handleSourceDocumentChange = useCallback(
    (nextDocument: SourceDocument) => {
      updateSelectedSource((currentSource) => {
        const normalizedDocument: SourceDocument = {
          ...nextDocument,
          id: nextDocument.id ?? currentSource.id,
          sourceId: nextDocument.sourceId ?? currentSource.sourceId ?? currentSource.id,
          schemaVersion: nextDocument.schemaVersion ?? currentSource.schemaVersion ?? 1,
          revision: nextDocument.revision ?? currentSource.revision ?? 1,
        };
        const previousAutoTitle = buildSourceAutoTitle(currentSource.sourceMeta);
        const nextAutoTitle = buildSourceAutoTitle(normalizedDocument.sourceMeta);
        const currentTitleEn = currentSource.title?.values?.en ?? "";
        const currentTitleNl = currentSource.title?.values?.nl ?? "";
        const canUpdateEn = isAutoManagedTitle(currentTitleEn, previousAutoTitle);
        const canUpdateNl = isAutoManagedTitle(currentTitleNl, previousAutoTitle);

        if (!canUpdateEn && !canUpdateNl) {
          return normalizedDocument;
        }

        return {
          ...normalizedDocument,
          title: {
            values: {
              ...(normalizedDocument.title?.values ?? {}),
              en: canUpdateEn
                ? nextAutoTitle
                : normalizedDocument.title?.values?.en ?? currentTitleEn,
              nl: canUpdateNl
                ? nextAutoTitle
                : normalizedDocument.title?.values?.nl ?? currentTitleNl,
            },
          },
        };
      });
    },
    [selectedSourceId]
  );

  const handleImportAdditionalPdnChunks = useCallback(
    (pdnChunks: string[]) => {
      if (!pdnChunks.length) return;
      const extras = pdnChunks
        .map((pdn) => {
          const base = createEmptySource(activeVariant);
          const init: SourceEditorState = {
            initialDocument: base,
            document: base,
            selectedNodeId: base.rootNodeId,
            lastImportSummary: null,
          };
          const next = sourceEditorReducer(init, {
            type: "IMPORT_PDN_TEXT",
            pdn,
          } as SourceEditorAction);
          const doc = next.document;
          const autoTitle = buildSourceAutoTitle(doc.sourceMeta);
          return {
            ...doc,
            title: {
              values: {
                ...(doc.title?.values ?? {}),
                en: autoTitle,
                nl: autoTitle,
              },
            },
          };
        })
        .filter((d) => (d.nodes?.length ?? 0) > 1);
      if (!extras.length) return;
      setSources((prev) => [...prev, ...extras]);
    },
    [activeVariant]
  );

  const shellStyle: CSSProperties =
    workspaceTab === "curriculum"
      ? {
          ...rootStyle,
          gridTemplateRows: "224px minmax(0, 1fr)",
        }
      : workspaceTab === "imports"
      ? {
          ...rootStyle,
          gridTemplateColumns: "minmax(0, 1fr)",
          gridTemplateRows: "252px minmax(0, 1fr)",
          gridTemplateAreas: `
            "header"
            "main"
          `,
        }
      : {
          ...rootStyle,
          gridTemplateRows: "252px minmax(0, 1fr)",
          gridTemplateColumns: "280px minmax(0, 1fr)",
          gridTemplateAreas: `
            "header header"
            "library main"
          `,
        };

  return (
    <div style={{ ...shellStyle, ...rootThemeStyle }}>
      <style>{`
        .smart-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .smart-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .smart-scroll:hover {
          scrollbar-width: thin;
        }
        .smart-scroll:hover::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .smart-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.45);
          border-radius: 999px;
        }
        .smart-scroll:hover::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      <div style={headerWrapStyle}>
        <header style={headerStyle}>
          <div style={headerLeftStyle}>
            <div style={headerTopRowStyle}>
              <div style={eyebrowStyle}>Lesson Studio</div>
              <div style={headerTopStatusStyle}>
                {conflictState ? (
                  <div style={conflictBoxStyle}>
                    <div>{conflictState.message}</div>
                    <button
                      type="button"
                      onClick={handleReloadConflictDocument}
                      style={dangerTinyButtonStyle}
                      disabled={isSyncing}
                    >
                      Reload server version
                    </button>
                  </div>
                ) : null}
                {activeStatus ? (
                  <div style={activeStatus.kind === "error" ? syncErrorStyle : syncMessageStyle}>
                    {activeStatus.text}
                  </div>
                ) : null}
                {workspaceTab === "curriculum" && selectedBook ? (
                  <div style={curriculumSaveMetaStyle}>
                    <span style={curriculumSaveStatusLabelStyle}>
                      {editorLanguage === "nl" ? "Opslag" : "Save state"}:{" "}
                      {curriculumSaveStatus === "dirty"
                        ? editorLanguage === "nl"
                          ? "niet opgeslagen"
                          : "unsaved"
                        : curriculumSaveStatus === "saving"
                          ? editorLanguage === "nl"
                            ? "opslaan…"
                            : "saving…"
                          : curriculumSaveStatus === "error"
                            ? editorLanguage === "nl"
                              ? "fout"
                              : "error"
                            : curriculumSaveStatus === "saved"
                              ? editorLanguage === "nl"
                                ? "opgeslagen"
                                : "saved"
                              : "—"}
                    </span>
                    {curriculumPersistPreview &&
                    curriculumPersistPreview.validation.warnings.length > 0 ? (
                      <span style={curriculumWarningsStyle} title={curriculumPersistPreview.validation.warnings
                        .slice(0, 6)
                        .map((w) => `${w.path}: ${w.message}`)
                        .join("\n")}>
                        {editorLanguage === "nl" ? "Waarschuwingen" : "Warnings"}:{" "}
                        {curriculumPersistPreview.validation.warnings.length}
                      </span>
                    ) : null}
                    {autosaveHint ? (
                      <span
                        style={
                          autosaveHint.includes("mislukt") || autosaveHint.includes("failed")
                            ? curriculumAutosaveErrorHintStyle
                            : curriculumAutosaveOkHintStyle
                        }
                      >
                        {autosaveHint}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div style={studioTopActionsStyle}>
                <button
                  type="button"
                  onClick={handleLoadFromServer}
                  style={{
                    ...studioHeaderActionButtonStyle,
                    opacity: isSyncing ? 0.6 : 1,
                    cursor: isSyncing ? "not-allowed" : "pointer",
                  }}
                  disabled={isSyncing}
                  title="Load latest data from server"
                >
                  {editorLanguage === "nl" ? "Laden" : "Load"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCurrentToServer}
                  style={{
                    ...studioHeaderActionButtonStyle,
                    opacity:
                      isSyncing ||
                      (workspaceTab === "curriculum"
                        ? !selectedBook
                        : workspaceTab === "sources"
                        ? !selectedSource
                        : true)
                        ? 0.6
                        : 1,
                    cursor:
                      isSyncing ||
                      (workspaceTab === "curriculum"
                        ? !selectedBook
                        : workspaceTab === "sources"
                        ? !selectedSource
                        : true)
                        ? "not-allowed"
                        : "pointer",
                  }}
                  disabled={
                    isSyncing ||
                    (workspaceTab === "curriculum"
                      ? !selectedBook || curriculumSaveBlocked
                      : workspaceTab === "sources"
                      ? !selectedSource
                      : true)
                  }
                  title={
                    workspaceTab === "curriculum" && curriculumSaveBlocked
                      ? editorLanguage === "nl"
                        ? "Authoringfouten blokkeren opslaan — zie melding hierboven"
                        : "Authoring errors block save — see message above"
                      : "Save current document to server"
                  }
                >
                  {editorLanguage === "nl" ? "Opslaan" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setI18nPanelOpen((v) => !v);
                  }}
                  style={{
                    ...studioHeaderActionButtonStyle,
                    border: i18nPanelOpen ? "1px solid #2563eb" : studioHeaderActionButtonStyle.border,
                  }}
                  title={
                    editorLanguage === "nl"
                      ? "Ontbrekende vertalingen, export en import"
                      : "Missing translations, export and import"
                  }
                >
                  i18n
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setI18nPanelOpen(false);
                    setSettingsOpen((v) => !v);
                  }}
                  style={{
                    ...studioHeaderActionButtonStyle,
                    border: settingsOpen ? "1px solid #2563eb" : studioHeaderActionButtonStyle.border,
                  }}
                  title="Open studio settings"
                >
                  {editorLanguage === "nl" ? "Instellingen" : "Settings"}
                </button>
              </div>
            </div>

            <div style={workspaceSwitchRowStyle}>
              <WorkspaceButton
                active={workspaceTab === "curriculum"}
                onClick={() => setWorkspaceTab("curriculum")}
              >
                {editorLanguage === "nl" ? "Curriculum" : "Curriculum"}
              </WorkspaceButton>
              <WorkspaceButton
                active={workspaceTab === "sources"}
                onClick={() => setWorkspaceTab("sources")}
              >
                {editorLanguage === "nl" ? "Bronnen" : "Sources"}
              </WorkspaceButton>
              <WorkspaceButton
                active={workspaceTab === "imports"}
                onClick={() => setWorkspaceTab("imports")}
              >
                {editorLanguage === "nl" ? "Imports" : "Imports"}
              </WorkspaceButton>
            </div>

            {workspaceTab === "curriculum" ? (
              <div style={titleGridStyle}>
                <input
                  value={
                    selectedBook
                      ? readLocalizedText(selectedBook.title, editorLanguage)
                      : ""
                  }
                  onChange={(e) => handleRenameBook(e.target.value)}
                  placeholder={editorLanguage === "nl" ? "Boektitel" : "Book title"}
                  style={bookTitleInputStyle}
                  disabled={!selectedBook}
                />

                <div style={inlineRowStyle}>
                  <input
                    value={
                      selectedLesson
                        ? readLocalizedText(selectedLesson.title, editorLanguage)
                        : ""
                    }
                    onChange={(e) => handleRenameLesson(e.target.value)}
                    placeholder={editorLanguage === "nl" ? "Lestitel" : "Lesson title"}
                    style={lessonTitleInputStyle}
                    disabled={!selectedLesson}
                  />

                  <input
                    value={
                      selectedLesson
                        ? readLocalizedText(selectedLesson.description, editorLanguage)
                        : ""
                    }
                    onChange={(e) => handleLessonDescriptionChange(e.target.value)}
                    placeholder={
                      editorLanguage === "nl"
                        ? "Korte lesbeschrijving"
                        : "Short lesson description"
                    }
                    style={compactInputStyle}
                    disabled={!selectedLesson}
                  />
                </div>
              </div>
            ) : workspaceTab === "sources" ? (
              <div style={titleGridStyle}>
                <input
                  value={sourceSearchQuery}
                  onChange={(e) => setSourceSearchQuery(e.target.value)}
                  placeholder={
                    editorLanguage === "nl"
                      ? "Zoek bron, wit, zwart, evenement"
                      : "Search source, white, black, event"
                  }
                  style={searchInputStyle}
                />
                <select
                  value={selectedSourceId ?? ""}
                  onChange={(e) => {
                    setSelectedSourceId(e.target.value || null);
                  }}
                  style={selectStyle}
                >
                  {filteredSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {readLocalizedText(source.title, editorLanguage)}
                    </option>
                  ))}
                </select>

                <div style={inlineRowStyle}>
                  <input
                    value={
                      selectedSource
                        ? readLocalizedText(selectedSource.title, editorLanguage)
                        : ""
                    }
                    onChange={(e) => handleRenameSource(e.target.value)}
                    placeholder={editorLanguage === "nl" ? "Brontitel" : "Source title"}
                    style={compactInputStyle}
                    disabled={!selectedSource}
                  />

                  <input
                    value={
                      selectedSource
                        ? readLocalizedText(selectedSource.description, editorLanguage)
                        : ""
                    }
                    onChange={(e) => handleSourceDescriptionChange(e.target.value)}
                    placeholder={
                      editorLanguage === "nl"
                        ? "Korte bronbeschrijving"
                        : "Short source description"
                    }
                    style={compactInputStyle}
                    disabled={!selectedSource}
                  />
                </div>
              </div>
            ) : (
              <div style={titleGridStyle}>
                <div style={sourceTypeBadgeStyle}>
                  {editorLanguage === "nl" ? "Importjobs beheerpaneel" : "Import jobs admin panel"}
                </div>
              </div>
            )}
          </div>

        </header>
      </div>
      {i18nPanelOpen ? (
        <div style={settingsOverlayStyle} onClick={() => setI18nPanelOpen(false)}>
          <div
            style={{ ...settingsPanelFloatingStyle, maxWidth: "min(92vw, 420px)", width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={settingsPanelHeaderStyle}>
              <strong>{editorLanguage === "nl" ? "Vertalingen (i18n)" : "Translations (i18n)"}</strong>
              <button
                type="button"
                style={secondaryActionButtonStyle}
                onClick={() => setI18nPanelOpen(false)}
              >
                {editorLanguage === "nl" ? "Sluiten" : "Close"}
              </button>
            </div>
            {workspaceTab === "curriculum" ? (
              <div style={settingsToolsRowStyle}>
                <button
                  type="button"
                  onClick={handleCheckMissingTranslations}
                  style={secondaryActionButtonStyle}
                  title="Scan missing localized texts"
                >
                  {editorLanguage === "nl"
                    ? "Controleer ontbrekende vertalingen"
                    : "Check missing translations"}
                </button>
                <button
                  type="button"
                  onClick={handleExportMissingTexts}
                  style={secondaryActionButtonStyle}
                  title="Export missing texts for external translation"
                >
                  {editorLanguage === "nl" ? "Exporteer ontbrekende teksten" : "Export missing texts"}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                {editorLanguage === "nl"
                  ? "Vertaalhulpmiddelen zijn beschikbaar op het tabblad Curriculum."
                  : "Translation tools are available on the Curriculum tab."}
              </div>
            )}
            <div style={translationPillStyle}>
              {editorLanguage === "nl" ? "Ontbrekende vertalingen" : "Missing translations"}:{" "}
              {translationGaps.length}
              {translationGaps.length > 0 ? (
                <div style={translationHintStyle}>
                  {translationGaps
                    .slice(0, 4)
                    .map((entry) => `${entry.path} (${entry.missing.join(", ")})`)
                    .join(" • ")}
                  {translationGaps.length > 4 ? " • ..." : ""}
                </div>
              ) : null}
            </div>
            <label style={settingsLabelStyle}>
              {editorLanguage === "nl" ? "Gevertaalde JSON importeren" : "Import translated JSON"}
              <textarea
                value={translationsImportJson}
                onChange={(e) => setTranslationsImportJson(e.target.value)}
                placeholder='[{"path":"lessons[0].steps[0].prompt","values":{"en":"..."}}]'
                style={settingsTextareaStyle}
              />
            </label>
            <button
              type="button"
              onClick={handleApplyImportedTranslations}
              style={primaryActionButtonStyle}
              disabled={!translationsImportJson.trim()}
            >
              {editorLanguage === "nl"
                ? "Geimporteerde vertalingen toepassen"
                : "Apply imported translations"}
            </button>
          </div>
        </div>
      ) : null}
      {settingsOpen ? (
        <div style={settingsOverlayStyle} onClick={() => setSettingsOpen(false)}>
          <div style={settingsPanelFloatingStyle} onClick={(e) => e.stopPropagation()}>
            <div style={settingsPanelHeaderStyle}>
              <strong>{editorLanguage === "nl" ? "Studio instellingen" : "Studio settings"}</strong>
              <button
                type="button"
                style={secondaryActionButtonStyle}
                onClick={() => setSettingsOpen(false)}
              >
                {editorLanguage === "nl" ? "Sluiten" : "Close"}
              </button>
            </div>
            <div style={settingsLabelStyle}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>
                {editorLanguage === "nl" ? "Taal" : "Language"}
              </span>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditorLanguage("nl")}
                  style={{
                    ...secondaryActionButtonStyle,
                    textAlign: "left",
                    border:
                      editorLanguage === "nl" ? "2px solid #2563eb" : secondaryActionButtonStyle.border,
                  }}
                >
                  Nederlands
                </button>
                <button
                  type="button"
                  onClick={() => setEditorLanguage("en")}
                  style={{
                    ...secondaryActionButtonStyle,
                    textAlign: "left",
                    border:
                      editorLanguage === "en" ? "2px solid #2563eb" : secondaryActionButtonStyle.border,
                  }}
                >
                  English
                </button>
              </div>
            </div>
            <label style={settingsLabelStyle}>
              {editorLanguage === "nl"
                ? "Preview: zet-animatie (seconden per zet/sprong, 0 = uit)"
                : "Preview: move animation (seconds per hop, 0 = off)"}
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={replayMoveSecondsPerStep}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setReplayMoveSecondsPerStep(Math.max(0, Math.min(2, v)));
                }}
                style={{ width: "100%", accentColor: "#2563eb" }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                {replayMoveSecondsPerStep <= 0
                  ? editorLanguage === "nl"
                    ? "Geen animatie — zetten springen direct."
                    : "No animation — moves jump instantly."
                  : editorLanguage === "nl"
                  ? `${replayMoveSecondsPerStep.toFixed(2)} s per zet of slagsprong; meersprongslag duurt even lang per sprong.`
                  : `${replayMoveSecondsPerStep.toFixed(2)} s per hop; multi-capture scales with hop count.`}
              </div>
            </label>
            <label style={settingsLabelStyle}>
              {editorLanguage === "nl" ? "Bordthema" : "Board theme"}
              <select
                value={boardTheme}
                onChange={(e) => setBoardTheme(e.target.value as BoardThemeId)}
                style={selectStyle}
              >
                <option value="classic">Classic</option>
                <option value="slate">Slate</option>
                <option value="forest">Forest</option>
                <option value="ocean">Ocean</option>
                <option value="sunset">Sunset</option>
                <option value="sand">Sand</option>
                <option value="midnight">Midnight</option>
                <option value="marble">Marble</option>
              </select>
            </label>
            <label style={settingsLabelStyle}>
              {editorLanguage === "nl" ? "Schijventhema" : "Piece theme"}
              <select
                value={pieceTheme}
                onChange={(e) => setPieceTheme(e.target.value as PieceThemeId)}
                style={selectStyle}
              >
                <option value="classic">Classic</option>
                <option value="flat">Flat</option>
                <option value="glass">Glass</option>
                <option value="bronze">Bronze</option>
                <option value="ivory">Ivory</option>
                <option value="neon">Neon</option>
                <option value="ruby">Ruby</option>
                <option value="mint">Mint</option>
              </select>
            </label>
            <label style={settingsLabelStyle}>
              {editorLanguage === "nl"
                ? "Standaard scandiepte (1-99, 99 ~= oneindig)"
                : "Default scan depth (1-99, 99 ~= infinite)"}
              <input
                type="number"
                min={1}
                max={99}
                value={defaultScanDepth}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setDefaultScanDepth(Math.max(1, Math.min(99, Math.floor(next))));
                }}
                style={compactInputStyle}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="smart-scroll" style={libraryPanelStyle}>
        {workspaceTab === "curriculum" ? (
          <div style={booksWrapStyle}>
            <div style={sidebarHeaderStyle}>
              <div>
                <div style={sidebarEyebrowStyle}>Books</div>
                <div style={sidebarTitleStyle}>Books & lessons</div>
              </div>
              <button type="button" onClick={handleCreateBook} style={sidebarButtonStyle}>
                + Book
              </button>
            </div>

            {visibleBooks.map((book) => {
              const isActiveBook = book.id === selectedBookId;
              const visibleBookLessons = book.lessons.filter(
                (lesson) => lesson.variantId === activeVariant
              );

              return (
                <div key={book.id} style={bookCardStyle}>
                  <div style={bookHeaderRowStyle}>
                    <button
                      type="button"
                      onClick={() => {
                        const lesson = visibleBookLessons[0] ?? null;
                        const step = lesson?.steps[0] ?? null;

                        setSelectedBookId(book.id);
                        setSelectedLessonId(lesson?.id ?? null);
                        setSelectedStepId(step?.id ?? null);
                      }}
                      style={isActiveBook ? activeBookButtonStyle : bookButtonStyle}
                    >
                      {readLocalizedText(book.title, editorLanguage)}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteBook(book.id)}
                      style={dangerTinyButtonStyle}
                    >
                      Delete
                    </button>
                  </div>

                  <div style={lessonListStyle}>
                    {visibleBookLessons.map((lesson) => {
                      const isActiveLesson = lesson.id === selectedLessonId;

                      return (
                        <div key={lesson.id} style={lessonRowStyle}>
                          <button
                            type="button"
                            onClick={() => {
                              const step = lesson.steps[0] ?? null;

                              setSelectedBookId(book.id);
                              setSelectedLessonId(lesson.id);
                              setSelectedStepId(step?.id ?? null);
                            }}
                            style={
                              isActiveLesson
                                ? activeLessonButtonStyle
                                : lessonButtonStyle
                            }
                          >
                            {readLocalizedText(lesson.title, editorLanguage)}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteLesson(lesson.id)}
                            style={dangerTinyButtonStyle}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {isActiveBook ? (
                    <button
                      type="button"
                      onClick={handleCreateLesson}
                      style={secondaryFullButtonStyle}
                    >
                      + Add lesson
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : workspaceTab === "sources" ? (
          <div style={booksWrapStyle}>
            <div style={sidebarHeaderStyle}>
              <div>
                <div style={sidebarEyebrowStyle}>Sources</div>
                <div style={sidebarTitleStyle}>Analysis library</div>
              </div>
              <button type="button" onClick={handleCreateSource} style={sidebarButtonStyle}>
                + Source
              </button>
            </div>

            {visibleSources.length === 0 ? (
              <div style={emptyLibraryStyle}>
                No sources for this variant yet.
              </div>
            ) : filteredSources.length === 0 ? (
              <div style={emptyLibraryStyle}>
                No sources match your search.
              </div>
            ) : (
              filteredSources.map((source) => {
                const isActive = source.id === selectedSourceId;

                return (
                  <div key={source.id} style={bookCardStyle}>
                    <div style={bookHeaderRowStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedSourceId(source.id)}
                        style={isActive ? activeBookButtonStyle : bookButtonStyle}
                      >
                        {readLocalizedText(source.title, editorLanguage)}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSource(source.id)}
                        style={dangerTinyButtonStyle}
                      >
                        Delete
                      </button>
                    </div>

                    <div style={sourceMetaStackStyle}>
                      <div style={sourceMetaItemStyle}>
                        <strong>Type:</strong>{" "}
                        {SOURCE_TYPE_LABELS[source.kind] ?? source.kind}
                      </div>
                      <div style={sourceMetaItemStyle}>
                        <strong>Format:</strong> {source.format}
                      </div>
                      <div style={sourceMetaItemStyle}>
                        <strong>Nodes:</strong> {source.nodes.length}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {workspaceTab === "imports" ? null : (
        <>
          {workspaceTab === "curriculum" ? (
          <div className="smart-scroll" style={timelinePanelStyle}>
            {selectedLesson?.authoringV2 ? (
              <AuthoringLessonStepsPanel
                orderedSteps={authoringStepOrder}
                selectedStepId={selectedStepId}
                language={editorLanguage}
                onSelectStep={(stepId) => {
                  setSelectedStepId(stepId);
                  setWorkspaceTab("curriculum");
                }}
                onInsertStepAfter={handleAuthoringInsertStepAfter}
                onInsertStepBefore={handleAuthoringInsertStepBefore}
                onDuplicateStep={handleAuthoringDuplicateStep}
                onDeleteStep={() => {
                  if (selectedStepId) handleDeleteStep(selectedStepId);
                }}
                onMoveStepUp={() => {
                  if (selectedStepId) handleMoveStepUp(selectedStepId);
                }}
                onMoveStepDown={() => {
                  if (selectedStepId) handleMoveStepDown(selectedStepId);
                }}
                onRenameStepTitle={handleRenameAuthoringStepTitle}
                sources={visibleSources}
                onImportFromSource={handleImportAuthoringFromSource}
                canDelete={authoringStepOrder.length > 1}
              />
            ) : (
              <div style={previewWrapStyle}>
                {editorLanguage === "nl"
                  ? "Deze lesson heeft nog geen v2 authoring data."
                  : "This lesson has no v2 authoring data yet."}
              </div>
            )}
          </div>
          ) : null}
        </>
        )}

      <div style={mainPanelStyle}>
        <div style={mainTabsBarStyle}>
          {workspaceTab === "curriculum" ? (
            <>
              <div style={mainTabsGroupStyle}>
                <TabButton
                  active={mainTab === "editor"}
                  onClick={() => setMainTab("editor")}
                >
                  Editor
                </TabButton>
                <TabButton
                  active={mainTab === "preview"}
                  onClick={() => setMainTab("preview")}
                >
                  Preview
                </TabButton>
              </div>

              <div style={mainStatusStyle}>
                {selectedStep
                  ? `Selected step: ${
                      readLocalizedText(selectedStep.title, editorLanguage) ||
                      selectedStep.type
                    }${
                      authoringPreviewResolved?.headline
                        ? ` · ${authoringPreviewResolved.headline}`
                        : ""
                    }`
                  : "No step selected"}
              </div>
              <button
                type="button"
                onClick={handleFetchStepPlayback}
                style={
                  playbackError
                    ? { ...dangerTinyButtonStyle, border: "1px solid #ef4444", color: "#991b1b" }
                    : playbackMessage
                    ? { ...secondaryActionButtonStyle, border: "1px solid #86efac", color: "#14532d" }
                    : secondaryActionButtonStyle
                }
                disabled={!selectedStepId || !selectedBookId || !selectedLessonId || isSyncing}
                title="Validate runtime playback payload for selected step"
              >
                Playback
              </button>
            </>
            ) : workspaceTab === "sources" ? (
              <div style={mainStatusStyle}>
                {selectedSource
                  ? `Selected source: ${readLocalizedText(
                      selectedSource.title,
                      editorLanguage
                    )}`
                  : "No source selected"}
              </div>
            ) : (
              <div style={mainStatusStyle}>Manage import jobs and processing batches.</div>
            )}
        </div>

        <div style={mainContentStyle}>
          {workspaceTab === "curriculum" ? (
            mainTab === "editor" ? (
              <BoardSceneCanvas
                step={selectedStep}
                variantId={selectedLesson?.variantId ?? activeVariant}
                defaultScanDepth={defaultScanDepth}
                currentBrush={currentBrush}
                onBrushChange={(tool) => {
                  setCurrentBrush(tool);
                }}
                onStepChange={handleUpdateStep}
                authoringPreview={
                  selectedLesson?.authoringV2 ? authoringPreviewResolved : null
                }
                authoringRecordingEnabled={!!selectedLesson?.authoringV2}
                authoringRecordingLanguage={editorLanguage}
                onAppendAuthoringMomentsFromRecording={
                  selectedLesson?.authoringV2
                    ? handleAppendAuthoringMomentsFromRecording
                    : undefined
                }
                onApplyRecordingToAskSequence={
                  applyRecordingToAskSequenceEnabled
                    ? handleApplyRecordingToSelectedAskSequence
                    : undefined
                }
                onAppendRecordingToAskSequence={
                  applyRecordingToAskSequenceEnabled
                    ? handleAppendRecordingToSelectedAskSequence
                    : undefined
                }
                onApplyRecordingToPlacePiecesWithShowLine={
                  applyRecordingToPlacePiecesEnabled
                    ? handleApplyRecordingToPlacePiecesWithShowLine
                    : undefined
                }
                onAppendRecordingAsNewAskMove={
                  selectedLesson?.authoringV2 ? handleAppendRecordingAsNewAskMove : undefined
                }
                onAppendRecordingAsNewAskSequence={
                  selectedLesson?.authoringV2 ? handleAppendRecordingAsNewAskSequence : undefined
                }
                authoringBoardFenOverride={editorFocusedAskSequenceFen}
                authoringBoardTargetPickMode={authoringBoardTargetPickMode}
                authoringStudioSquareSelection={authoringStudioSquareSelection}
                authoringTargetPickPiecesOnly={authoringAskSelectPiecesOnly}
                onAuthoringTargetSquareToggle={handleAuthoringTargetSquareToggle}
                authoringAskSequenceHint={authoringAskSequenceHintForBoard}
              />
            ) : (
              <div style={previewWrapStyle}>
                <StepPreviewPanel
                  step={selectedStep}
                  language={editorLanguage}
                  variantId={selectedLesson?.variantId ?? activeVariant}
                  replayMoveSecondsPerStep={replayMoveSecondsPerStep}
                  authoringPreview={
                    selectedLesson?.authoringV2 ? authoringPreviewResolved : null
                  }
                  authoringInteractiveMoment={
                    selectedLesson?.authoringV2 ? authoringInteractiveMomentForPreview : null
                  }
                  authoringBoardTargetPickMode={authoringBoardTargetPickMode}
                  authoringStudioSquareSelection={authoringStudioSquareSelection}
                  authoringTargetPickPiecesOnly={authoringAskSelectPiecesOnly}
                  onAuthoringTargetSquareToggle={handleAuthoringTargetSquareToggle}
                  onAuthoringAskCountPreviewDraft={setAuthoringAskCountPreviewDraft}
                  placePiecesPreviewLoadRequest={placePiecesPreviewLoadRequest}
                  placePiecesPreviewBoardGetterRef={placePiecesPreviewBoardGetterRef}
                  hasPreviousStep={hasPreviousPreviewStep}
                  hasNextStep={!!hasNextPreviewStep}
                  onPreviousStep={() => {
                    if (!selectedLesson || selectedStepIndex <= 0) return;
                    const prev = selectedLesson.steps[selectedStepIndex - 1];
                    if (prev?.id) setSelectedStepId(prev.id);
                  }}
                  onNextStep={() => {
                    if (!selectedLesson) return;
                    const next = selectedLesson.steps[selectedStepIndex + 1];
                    if (next?.id) setSelectedStepId(next.id);
                  }}
                />
              </div>
            )
            ) : workspaceTab === "sources" && hasValidSource ? (
              <SourceEditorPage
                key={selectedSource.id}
                initialDocument={selectedSource}
                language={editorLanguage}
                onDocumentChange={handleSourceDocumentChange}
                onImportAdditionalPdnChunks={handleImportAdditionalPdnChunks}
              />
            ) : workspaceTab === "sources" ? (
              <div style={previewWrapStyle}>No valid source.</div>
            ) : (
              <ImportJobsPanel language={editorLanguage} />
            )}
        </div>
      </div>

      {workspaceTab === "curriculum" ? (
      <div className="smart-scroll" style={inspectorPanelStyle}>
        {selectedLesson?.authoringV2 && selectedStepId ? (
          <div style={{ marginBottom: 14 }}>
            {authoringInspectedBranchId ? (
              <>
                <AuthoringTimelineMomentFlowBar
                  language={editorLanguage}
                  context="branch"
                  selectedMomentId={selectedBranchMomentId}
                  wholeMomentCanPaste={wholeMomentCanPaste}
                  onCopyWholeMoment={handleCopyWholeMomentFromBranch}
                  onPasteWholeMoment={handlePasteWholeMomentOnBranch}
                  showDuplicateToNewStep={false}
                  showDuplicateToBranch={false}
                  showMoveToMainStep={inspectedBranchTimelineLength > 1}
                  onMoveToMainStep={handleMoveSelectedBranchMomentToMainStep}
                />
                <AuthoringBranchEditorPanel
                  branch={
                    selectedLesson.authoringV2.branchesById?.[authoringInspectedBranchId]
                  }
                  language={editorLanguage}
                  selectedMomentId={selectedBranchMomentId}
                  quickAddTypes={listQuickAddMomentTypes()}
                  onSelectMoment={setSelectedBranchMomentId}
                  onApplyBranch={handleApplyEditingBranch}
                  onTimelineChange={handleBranchEditorTimelineChange}
                  onClose={() => setAuthoringInspectedBranchId(null)}
                />
                {selectedBranchAuthoringMoment?.type === "askMove" ? (
                  <AuthoringAskMoveMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "askSequence" ? (
                  <AuthoringAskSequenceMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    onFocusPly={handleFocusAskSequencePly}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "askCount" ? (
                  <AuthoringAskCountMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    {...authoringAskCountComfortProps}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "askSelectSquares" ? (
                  <AuthoringAskSelectSquaresMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    {...authoringSelectComfortProps}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "askSelectPieces" ? (
                  <AuthoringAskSelectPiecesMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    {...authoringSelectComfortProps}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "multipleChoice" ? (
                  <AuthoringMultipleChoiceMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "placePieces" ? (
                  <AuthoringPlacePiecesMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    editorSourceFen={placementEditorSourceFen}
                    currentBoardFen={selectedStep?.initialState?.fen}
                    {...authoringPlacePiecesComfortProps}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "showLine" ? (
                  <AuthoringShowLineMomentFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                  />
                ) : null}
                {selectedBranchAuthoringMoment?.type === "introText" ? (
                  <AuthoringMomentTextFields
                    moment={selectedBranchAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedBranchMoment}
                    currentBoardFen={authoringPreviewResolved?.fen}
                  />
                ) : null}
              </>
            ) : (
              <>
                <AuthoringTimelineMomentFlowBar
                  language={editorLanguage}
                  context="step"
                  selectedMomentId={selectedMomentId}
                  wholeMomentCanPaste={wholeMomentCanPaste}
                  onCopyWholeMoment={handleCopyWholeMomentFromStep}
                  onPasteWholeMoment={handlePasteWholeMomentOnStep}
                  showDuplicateToNewStep
                  onDuplicateToNewStep={handleDuplicateSelectedMomentToNewStep}
                  showDuplicateToBranch
                  onDuplicateToBranch={handleDuplicateSelectedMomentToBranchWithLink}
                  showMoveToMainStep={false}
                />
                <StepTimelineEditor
                  moments={
                    selectedLesson.authoringV2.stepsById[selectedStepId]?.timeline ?? []
                  }
                  selectedMomentId={selectedMomentId}
                  language={editorLanguage}
                  quickAddTypes={listQuickAddMomentTypes()}
                  onSelectMoment={setSelectedMomentId}
                  onTimelineChange={handleAuthoringTimelineChange}
                  onSplitStepAtSelectedMoment={handleAuthoringSplitAtSelectedMoment}
                  onExtractSelectedMomentsToNewStep={handleAuthoringExtractSelectedToNewStep}
                  onExtractSelectedMomentsToBranch={handleAuthoringExtractSelectedToBranch}
                  canExtractSelectedMoment={authoringTimelineMomentCount >= 2}
                />
                {selectedAuthoringMoment?.branchAction ? (
                  <>
                    <AuthoringLinkedBranchPanel
                      branch={
                        selectedLesson.authoringV2.branchesById?.[
                          selectedAuthoringMoment.branchAction.branchId
                        ]
                      }
                      language={editorLanguage}
                      onInspect={() =>
                        setAuthoringInspectedBranchId(
                          selectedAuthoringMoment.branchAction!.branchId
                        )
                      }
                      onUnlink={handleUnlinkSelectedBranchLink}
                    />
                    <AuthoringBranchActionMomentFields
                      moment={selectedAuthoringMoment}
                      language={editorLanguage}
                      onApply={applyAuthoringSelectedMoment}
                      branchPicker={
                        branchPickerChoices.length > 0
                          ? {
                              choices: branchPickerChoices,
                              onRelink: handleRelinkEnterBranchMoment,
                            }
                          : undefined
                      }
                    />
                  </>
                ) : null}
                {selectedAuthoringMoment?.type === "askMove" ? (
                  <AuthoringAskMoveMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "askSequence" ? (
                  <AuthoringAskSequenceMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    onFocusPly={handleFocusAskSequencePly}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "askCount" ? (
                  <AuthoringAskCountMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    {...authoringAskCountComfortProps}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "askSelectSquares" ? (
                  <AuthoringAskSelectSquaresMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    {...authoringSelectComfortProps}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "askSelectPieces" ? (
                  <AuthoringAskSelectPiecesMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    {...authoringSelectComfortProps}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "multipleChoice" ? (
                  <AuthoringMultipleChoiceMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "placePieces" ? (
                  <AuthoringPlacePiecesMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    editorSourceFen={placementEditorSourceFen}
                    currentBoardFen={selectedStep?.initialState?.fen}
                    {...authoringPlacePiecesComfortProps}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "showLine" ? (
                  <AuthoringShowLineMomentFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                  />
                ) : null}
                {selectedAuthoringMoment?.type === "introText" ? (
                  <AuthoringMomentTextFields
                    moment={selectedAuthoringMoment}
                    language={editorLanguage}
                    onApply={applyAuthoringSelectedMoment}
                    currentBoardFen={authoringPreviewResolved?.fen}
                  />
                ) : null}
              </>
            )}
            {authoringPresentationMoment ? (
              <AuthoringMomentComfortBar
                language={editorLanguage}
                canPaste={authoringPresentationRuntimeCanPaste}
                onCopy={handleCopyAuthoringPresentationRuntime}
                onPaste={handlePasteAuthoringPresentationRuntime}
              />
            ) : null}
            {authoringPresentationMoment ? (
              <AuthoringMomentPresentationPanel
                moment={authoringPresentationMoment}
                language={editorLanguage}
                onApply={(next) => {
                  if (authoringInspectedBranchId) {
                    applyAuthoringSelectedBranchMoment(next);
                  } else {
                    applyAuthoringSelectedMoment(next);
                  }
                }}
              />
            ) : null}
            {authoringPresentationMoment ? (
              <AuthoringMomentRuntimePanel
                moment={authoringPresentationMoment}
                language={editorLanguage}
                onApply={(next) => {
                  if (authoringInspectedBranchId) {
                    applyAuthoringSelectedBranchMoment(next);
                  } else {
                    applyAuthoringSelectedMoment(next);
                  }
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #2563eb" : "1px solid #d0d7e2",
        background: active ? "#eff6ff" : "#fff",
        color: active ? "#1d4ed8" : "#111827",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function WorkspaceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #2563eb" : "1px solid #d0d7e2",
        background: active ? "#eff6ff" : "#fff",
        color: active ? "#1d4ed8" : "#111827",
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const rootStyle: CSSProperties = {
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "280px 320px minmax(0, 1fr) 360px",
  gridTemplateRows: "262px minmax(0, 1fr)",
  gridTemplateAreas: `
    "header header header header"
    "library timeline main inspector"
  `,
  background: "#edf2f7",
  color: "#111827",
};

const headerWrapStyle: CSSProperties = {
  gridArea: "header",
  background: "#fff",
  borderBottom: "1px solid #dbe3ec",
};

const headerStyle: CSSProperties = {
  height: "100%",
  minHeight: 192,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: 16,
  padding: "18px 20px",
  boxSizing: "border-box",
};

const headerLeftStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
  gap: 10,
};

const headerTopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
};

const headerTopStatusStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gap: 8,
};

const workspaceSwitchRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 0,
};

const titleGridStyle: CSSProperties = {
  display: "grid",
  gridAutoRows: "minmax(36px, auto)",
  gap: 8,
  minWidth: 0,
};

const inlineRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: 8,
  minWidth: 0,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const studioTopActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  marginLeft: "auto",
};

const studioHeaderActionButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: 0,
};

const bookTitleInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxSizing: "border-box",
  background: "#fff",
  color: "#6b7280",
};

const lessonTitleInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxSizing: "border-box",
  background: "#fff",
  color: "#6b7280",
};

const compactInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxSizing: "border-box",
  background: "#fff",
  color: "#6b7280",
};

const secondaryActionButtonStyle: CSSProperties = {
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fff",
  color: "#1f2937",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryActionButtonStyle: CSSProperties = {
  ...secondaryActionButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const settingsToolsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const conflictBoxStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  borderRadius: 10,
  padding: "8px 10px",
  display: "grid",
  gap: 8,
  fontSize: 12,
  color: "#7f1d1d",
};

const syncMessageStyle: CSSProperties = {
  fontSize: 12,
  color: "#14532d",
  background: "#f0fdf4",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "6px 8px",
};

const syncErrorStyle: CSSProperties = {
  fontSize: 12,
  color: "#7f1d1d",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "6px 8px",
};

const curriculumSaveMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "#475569",
};

const curriculumSaveStatusLabelStyle: CSSProperties = {
  fontWeight: 600,
};

const curriculumWarningsStyle: CSSProperties = {
  color: "#b45309",
  fontWeight: 600,
  cursor: "help",
};

const curriculumAutosaveOkHintStyle: CSSProperties = {
  color: "#15803d",
  fontWeight: 600,
  maxWidth: 280,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const curriculumAutosaveErrorHintStyle: CSSProperties = {
  ...curriculumAutosaveOkHintStyle,
  color: "#b91c1c",
};

const selectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "7px 10px",
  fontSize: 13,
  background: "#fff",
  color: "#111827",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  background: "#fff",
  color: "#111827",
  boxSizing: "border-box",
};

const sourceTypeBadgeStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  background: "#f8fafc",
  color: "#334155",
  fontWeight: 700,
  fontSize: 14,
  padding: "10px 12px",
  minHeight: 40,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
};

const translationPillStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  lineHeight: 1.35,
};

const translationHintStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
};

const settingsOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.28)",
  zIndex: 50,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  padding: "84px 20px 20px 20px",
  boxSizing: "border-box",
};

const settingsPanelFloatingStyle: CSSProperties = {
  width: 360,
  maxWidth: "min(92vw, 360px)",
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  background: "#ffffff",
  padding: "12px",
  display: "grid",
  gap: 10,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.24)",
};

const settingsPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "#0f172a",
  fontSize: 14,
};

const settingsLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
};

const settingsTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 110,
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  boxSizing: "border-box",
  resize: "vertical",
  background: "#fff",
  color: "#0f172a",
};

const hiddenScrollbarStyle: CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const libraryPanelStyle: CSSProperties = {
  gridArea: "library",
  minWidth: 0,
  minHeight: 0,        // 👈 TOEVOEGEN
  overflowY: "auto",   // 👈 veranderen
  borderRight: "1px solid #dbe3ec",
  background: "#fff",
  ...hiddenScrollbarStyle,
};

const booksWrapStyle: CSSProperties = {
  padding: 16,
  display: "grid",
  gap: 14,
};

const sidebarHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const sidebarEyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const sidebarTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#111827",
  marginTop: 4,
};

const sidebarButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "9px 12px",
  background: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
};

const bookCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 14,
  padding: 12,
  background: "#fbfcfe",
  display: "grid",
  gap: 10,
};

const bookHeaderRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const bookButtonStyle: CSSProperties = {
  flex: 1,
  textAlign: "left",
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  color: "#111827",
};

const activeBookButtonStyle: CSSProperties = {
  ...bookButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const lessonListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const lessonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const lessonButtonStyle: CSSProperties = {
  flex: 1,
  textAlign: "left",
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "9px 10px",
  background: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
};

const activeLessonButtonStyle: CSSProperties = {
  ...lessonButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const dangerTinyButtonStyle: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "7px 8px",
  background: "#fff5f5",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: "#b91c1c",
};

const secondaryFullButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
  width: "100%",
};

const emptyLibraryStyle: CSSProperties = {
  border: "1px dashed #cfd8e3",
  borderRadius: 14,
  padding: 16,
  fontSize: 14,
  color: "#6b7280",
  background: "#fafcff",
};

const sourceMetaStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const sourceMetaItemStyle: CSSProperties = {
  fontSize: 12,
  color: "#4b5563",
};

const timelinePanelStyle: CSSProperties = {
  gridArea: "timeline",
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  padding: 8,
  boxSizing: "border-box",
  borderRight: "1px solid #dbe3ec",
  background: "#fbfcfe",
  ...hiddenScrollbarStyle,
};

const mainPanelStyle: CSSProperties = {
  gridArea: "main",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: "#fff",
  display: "grid",
  gridTemplateRows: "68px minmax(0, 1fr)", // 👈 BELANGRIJK
};

const mainTabsBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 18px",
  borderBottom: "1px solid #dbe3ec",
  background: "#fcfdff",
};

const mainTabsGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const mainStatusStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 600,
};

const mainContentStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: "hidden",
  overflowX: "hidden",
};

const previewWrapStyle: CSSProperties = {
  padding: 20,
  boxSizing: "border-box",
};

const inspectorPanelStyle: CSSProperties = {
  gridArea: "inspector",
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  padding: 10,
  boxSizing: "border-box",
  borderLeft: "1px solid #dbe3ec",
  background: "#fff",
  ...hiddenScrollbarStyle,
};
