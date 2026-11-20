/** JSON localStorage access that never throws: blocked storage reads as empty and drops writes. */
export function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory state still works for this session.
  }
}

export function readStorageString(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
