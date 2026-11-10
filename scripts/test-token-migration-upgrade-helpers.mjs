function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

/** Return the exact local database container ID from `docker ps` formatted output. */
export function parseDatabaseContainerId(output, expectedName) {
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+)\s+(.+)$/);
    if (!match) continue;

    const [, containerId, names] = match;
    if (names.split(",").map((name) => name.trim()).includes(expectedName)) return containerId;
  }
  return undefined;
}

/** Preserve the primary failure while making a cleanup failure visible to callers. */
export function mergeCleanupError(primaryError, cleanupError) {
  if (primaryError === undefined || primaryError === null) return asError(cleanupError);
  if (cleanupError === undefined || cleanupError === null) return asError(primaryError);

  const primary = asError(primaryError);
  const cleanup = asError(cleanupError);
  return new Error(`${primary.message}\nCleanup also failed:\n${cleanup.message}`, { cause: primary });
}
