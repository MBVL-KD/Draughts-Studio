/**
 * Versioning for persisted curriculum books (Mongo / PATCH contract).
 *
 * Bump `BOOK_DOCUMENT_SCHEMA_VERSION` when the persisted envelope shape changes in a
 * breaking way. Individual `authoringV2` bundles may gain their own revision later.
 */
export const BOOK_DOCUMENT_SCHEMA_VERSION = 1;

/** Runtime export bundle version (skeleton; lesson player not wired yet). */
export const RUNTIME_LESSON_EXPORT_SCHEMA_VERSION = 1;

export const AUTHORING_SAVE_PIPELINE_VERSION = 1;
