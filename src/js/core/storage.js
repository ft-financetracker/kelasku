/** Browser storage helper. */
export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function readBool(key) {
  return localStorage.getItem(key) === 'true';
}

export function writeBool(key, value) {
  localStorage.setItem(key, String(Boolean(value)));
}
