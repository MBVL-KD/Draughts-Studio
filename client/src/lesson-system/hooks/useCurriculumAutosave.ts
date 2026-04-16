import { useEffect, useRef, type MutableRefObject } from "react";
import type { Book } from "../types/lessonTypes";
import { persistCurriculumBookDocument } from "../api/lessonStorageApi";
import { normalizeBookForSave, normalizeBookFromServer } from "../storage/normalizePersistedBook";
import {
  authoringValidationBlocksSave,
  prepareBookForPersistedSave,
} from "../storage/saveBookPipeline";
import { stableStringifyBookForSnapshot } from "../storage/stableBookSnapshot";
import { getDocumentId } from "../utils/documentIds";

const DEFAULT_DEBOUNCE_MS = 3200;

type Params = {
  enabled: boolean;
  debounceMs?: number;
  workspaceTab: string;
  selectedBook: Book | null;
  booksRef: MutableRefObject<Book[]>;
  selectedBookIdRef: MutableRefObject<string | null>;
  bookRevisionsRef: MutableRefObject<Record<string, number>>;
  curriculumSnapshotRef: MutableRefObject<Record<string, string>>;
  conflictState: { kind: string; id: string; message: string } | null;
  blockAutosave: boolean;
  contentFingerprint: string | null;
  onPersistSuccess: (storedBook: Book, bookId: string) => void;
  setAutosaveBusy: (b: boolean) => void;
  setAutosaveHint: (t: string) => void;
  editorLanguage: "en" | "nl";
};

/**
 * Debounced autosave for curriculum books that already exist on the server (known revision).
 * Skips books without a persisted revision (first save must be manual).
 */
export function useCurriculumAutosave(params: Params) {
  const {
    enabled,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    workspaceTab,
    selectedBook,
    booksRef,
    selectedBookIdRef,
    bookRevisionsRef,
    curriculumSnapshotRef,
    conflictState,
    blockAutosave,
    contentFingerprint,
    onPersistSuccess,
    setAutosaveBusy,
    setAutosaveHint,
    editorLanguage,
  } = params;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hintClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || workspaceTab !== "curriculum" || !selectedBook || conflictState || blockAutosave) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setAutosaveBusy(false);
      return;
    }

    const bookId = getDocumentId(selectedBook);
    const knownRevision = bookRevisionsRef.current[bookId];
    if (typeof knownRevision !== "number" || !Number.isFinite(knownRevision)) {
      return;
    }

    const baseline = curriculumSnapshotRef.current[bookId];
    if (
      !contentFingerprint ||
      baseline === undefined ||
      contentFingerprint === baseline
    ) {
      return;
    }

    const prep = prepareBookForPersistedSave(selectedBook);
    if (authoringValidationBlocksSave(prep.validation)) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const run = async () => {
        const sid = selectedBookIdRef.current;
        const latest =
          booksRef.current.find((b) => b.id === sid) ??
          booksRef.current.find((b) => getDocumentId(b) === bookId) ??
          null;
        if (!latest) return;

        const { document: toSend, validation } = prepareBookForPersistedSave(latest);
        if (authoringValidationBlocksSave(validation)) return;

        const id = getDocumentId(toSend);
        const rev = bookRevisionsRef.current[id];
        if (typeof rev !== "number" || !Number.isFinite(rev)) return;

        const snap = stableStringifyBookForSnapshot(normalizeBookForSave(latest));
        const base = curriculumSnapshotRef.current[id];
        if (base !== undefined && snap === base) return;

        setAutosaveBusy(true);
        try {
          const response = await persistCurriculumBookDocument({
            book: toSend,
            knownRevision: rev,
            signal: ac.signal,
          });
          if (ac.signal.aborted) return;
          const stored = normalizeBookFromServer(response.item);
          onPersistSuccess(stored, id);
          const hint =
            editorLanguage === "nl" ? "Automatisch opgeslagen" : "Auto-saved";
          setAutosaveHint(hint);
          if (hintClearRef.current) clearTimeout(hintClearRef.current);
          hintClearRef.current = window.setTimeout(() => {
            setAutosaveHint("");
            hintClearRef.current = null;
          }, 4000);
        } catch (e: unknown) {
          if (ac.signal.aborted) return;
          const err = e as { status?: number; message?: string };
          if (err.status === 409) {
            setAutosaveHint(
              editorLanguage === "nl"
                ? "Autosave: conflict — handmatig herladen of opslaan"
                : "Autosave: conflict — reload or save manually"
            );
            return;
          }
          setAutosaveHint(
            `${editorLanguage === "nl" ? "Autosave mislukt" : "Autosave failed"}: ${err.message ?? "?"}`
          );
        } finally {
          if (!ac.signal.aborted) {
            setAutosaveBusy(false);
          }
        }
      };

      void run();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    enabled,
    debounceMs,
    workspaceTab,
    selectedBook,
    conflictState,
    blockAutosave,
    contentFingerprint,
    booksRef,
    selectedBookIdRef,
    bookRevisionsRef,
    curriculumSnapshotRef,
    onPersistSuccess,
    setAutosaveBusy,
    setAutosaveHint,
    editorLanguage,
  ]);
}
