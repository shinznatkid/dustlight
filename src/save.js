// Settings + per-level progress in localStorage, and the album of saved rooms in
// IndexedDB. Every access is guarded: a private window or blocked storage just
// means nothing persists, never a crash.

// the key keeps the game's earlier name on purpose: renaming it would lose every player's save
const KEY = 'hearthlight.v1';

const DEFAULTS = {
  // medium by default: "high" supersamples, which a big window can't always afford
  // daycycle: 'auto' = the day goes round by itself once a room is repaired · 'stop' = it stays
  settings: { lang: null, music: 0.7, ambience: 0.6, sfx: 0.8, quality: 'medium', showFps: false, daycycle: 'auto', debug: false },
  levels: {},
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      settings: { ...DEFAULTS.settings, ...(data.settings ?? {}) },
      levels: data.levels ?? {},
      last: data.last ?? null,
    };
  } catch {
    return structuredClone({ ...DEFAULTS, last: null });
  }
}

const data = read();

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  get settings() { return data.settings; },
  setSetting(k, v) {
    data.settings[k] = v;
    write();
  },
  // the level last played, for "Continue"
  get last() { return data.last && data.levels[data.last] ? data.last : null; },
  level(id) { return data.levels[id] ?? null; },
  saveLevel(id, state) {
    data.levels[id] = { ...state, savedAt: Date.now() };
    data.last = id;
    return write();
  },
  clearLevel(id) {
    delete data.levels[id];
    if (data.last === id) data.last = null;
    write();
  },
};

// ---- the album: rooms kept to look at later ---------------------------------------------------
// { id, level, at (ms), thumb (JPEG data URL), state (a whole level save) } — a few
// hundred KB each, too much for localStorage's ~5 MB, so IndexedDB. Resolves empty
// / false when IndexedDB isn't there.
let dbp = null;
function db() {
  dbp ??= new Promise((res) => {
    try {
      // the database keeps the game's earlier name on purpose: renaming it would lose every album
      const r = indexedDB.open('hearthlight', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('album', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res) => {
    if (!d) {
      res(null);
      return;
    }
    try {
      const t = d.transaction('album', mode);
      const req = fn(t.objectStore('album'));
      t.oncomplete = () => res(req.result ?? true);
      t.onerror = () => res(null);
      t.onabort = () => res(null);
    } catch {
      res(null);
    }
  }));
}
export const album = {
  // newest first
  list: () => tx('readonly', (s) => s.getAll()).then((a) => (Array.isArray(a) ? a : []).sort((x, y) => y.at - x.at)),
  add: (entry) => tx('readwrite', (s) => s.put(entry)).then((r) => r !== null),
  remove: (id) => tx('readwrite', (s) => s.delete(id)).then((r) => r !== null),
};
