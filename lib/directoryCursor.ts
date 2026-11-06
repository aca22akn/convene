const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function encodeDirectoryCursor(createdAt: string, personId: string): string {
  return `${createdAt}|${personId}`;
}

export function parseDirectoryCursor(cursor: string | null): string | null {
  if (cursor === null) return null;
  const separator = cursor.lastIndexOf("|");
  if (separator < 1) return null;
  const createdAt = cursor.slice(0, separator);
  const personId = cursor.slice(separator + 1);
  const millisecondPrecision = createdAt.replace(/(\.\d{3})\d+(Z)$/, "$1$2");
  if (!CURSOR_TIME.test(createdAt) || !UUID.test(personId) || !Number.isFinite(Date.parse(millisecondPrecision))) return null;
  return cursor;
}
