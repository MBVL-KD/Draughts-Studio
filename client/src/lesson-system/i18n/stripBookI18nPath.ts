/** Paths from find/export missing use `book.title` while the Book root has `title` at top level. */
export function stripBookRootPrefixForI18nPath(path: string): string {
  return path.startsWith("book.") ? path.slice("book.".length) : path;
}
