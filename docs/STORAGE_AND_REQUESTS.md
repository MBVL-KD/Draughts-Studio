# Authoring v2 — storage & request lifecycle

## Layers

1. **Authoring (in-memory)** — `Book` / `Lesson` / `LessonAuthoringBundle` as edited in the studio (includes `editorMeta`, local ids, etc.).
2. **Persisted** — Same JSON envelope as stored in Mongo after **`normalizeBookForSave`** (`client/src/lesson-system/storage/normalizePersistedBook.ts`): canonical ids, `schemaVersion`, normalized + pruned `authoringV2`, **sanitized** (editor-only fields stripped on steps/moments/branches).
3. **Runtime export** — Skeleton: `exportAuthoringLessonToRuntime` in `client/src/lesson-system/storage/runtimeExport.ts` (expand toward lesson player / Roblox).

## Save pipeline (client)

Order enforced in code:

1. **`prepareBookForPersistedSave`** (`saveBookPipeline.ts`) → `normalizeBookForSave` → `validateBookAuthoringV2`.
2. If **`validation.errors`** non-empty → save is **blocked** (no HTTP call); messages shown in the header.
3. **`validation.warnings`** do not block save; count + tooltip in the studio header.
4. **`persistCurriculumBookDocument`** (`api/lessonStorageApi.ts`) → `patchBook` / `createBook` with optional `AbortSignal` via `httpClient`.

Normalize details:

- Book/lesson/step canonical ids, default `schemaVersion` / `revision` / `status`.
- Per-lesson **`normalizeAuthoringBundleForPersist`** — step order, orphan step ids dropped, branch graph pruned to reachable branches, interaction square lists sorted/deduped, overlay square lists normalized.
- **`sanitizeAuthoringBundleForPersist`** — removes `editorMeta` from persisted steps, moments, and branch timelines.

Deserialize (load):

- **`normalizeBookFromServer`** — same as save normalize + default `variantId` on lessons.
- **`deserializeAuthoringLessonBundle`** (`serializeAuthoringDocument.ts`) — lighter id/order sync without stripping editor fields (for future load paths).

## Versioning

- **`BOOK_DOCUMENT_SCHEMA_VERSION`** (`authoringStorageConstants.ts`) — persisted book envelope; bump when the top-level book JSON contract changes incompatibly.
- **`revision`** — optimistic concurrency on the server (existing behaviour).
- **`RUNTIME_LESSON_EXPORT_SCHEMA_VERSION`** — separate from persisted books; bump when runtime export shape changes.

## Dirty / save status

- Fingerprint: **`stableStringifyBookForSnapshot(normalizeBookForSave(book))`** compared to a per-book ref updated on successful load/save/conflict reload.
- UI status: `idle` | `dirty` | `saving` | `saved` | `error` (`persistedBookTypes.ts`), shown next to sync messages in **Lesson Studio** (curriculum tab).

## Autosave (curriculum)

- Hook: `client/src/lesson-system/hooks/useCurriculumAutosave.ts` — **~3.2s debounce** after the last local change, only on the **curriculum** tab, only when the book **already has a server revision** (no autosave `POST` for never-saved books).
- Skips when **`isSyncing`** (manual load/save), when **`conflictState`** is set, or when **authoring validation errors** would block save.
- Uses **`AbortSignal`** on `persistCurriculumBookDocument`; overlapping edits reschedule the timer.
- Success / conflict / failure surface as a short **autosave hint** in the header (separate from manual sync messages).

## Server contract

- **PATCH** `/api/books/:bookId` — `{ expectedRevision, document }` where `document` is a full book replacement (existing pattern).
- **POST** `/api/books` — `{ document }`.
- Zod **`BookSchema`** now allows optional **`lessons[].authoringV2`** (`unknown`) so the field is explicit in the validation contract (deep authoring checks remain client-side for now).

## Central API entry points

- Low-level: `client/src/lesson-system/api/booksApi.ts` (list/get/create/patch/delete; optional `RequestInit` / `signal`).
- Curriculum save helper: `client/src/lesson-system/api/lessonStorageApi.ts` (`persistCurriculumBookDocument`, `formatStorageApiError`).

## TODO / follow-ups

- Debounced autosave using the same pipeline + `AbortSignal`.
- Stricter server-side authoring-v2 schema (subset Zod) mirroring client validators.
- Richer runtime export (moments, interactions, branching).
