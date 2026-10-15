// Telegram CloudStorage: per-user, per-bot storage on Telegram's servers.
// Values are limited to 4096 characters and 1024 keys per user, so the state is
// stored as JSON split into chunks. Two generations of chunks ('a' and 'b')
// alternate: a save writes the inactive generation and then switches the
// `meta` pointer, so an interrupted save never corrupts the previous copy.
// Capacity: ~500 chunks × 4000 chars ≈ 2 MB of JSON.

const CHUNK_SIZE = 4000;
const META_KEY = 'meta';
// Local fake for testing sync in a regular browser: localStorage['budget:mock-cloud'] = '1'.
const MOCK_FLAG = 'budget:mock-cloud';

function telegramStorage() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData || !tg.isVersionAtLeast?.('6.9') || !tg.CloudStorage) return null;
  const call = (method, ...args) =>
    new Promise((resolve, reject) =>
      tg.CloudStorage[method](...args, (err, result) => (err ? reject(new Error(err)) : resolve(result))),
    );
  return {
    getItem: (key) => call('getItem', key),
    getItems: (keys) => call('getItems', keys),
    setItem: (key, value) => call('setItem', key, value),
    removeItems: (keys) => call('removeItems', keys),
  };
}

function mockStorage() {
  const prefix = 'budget:mock-cloud:';
  const delay = () => new Promise((r) => setTimeout(r, 50));
  return {
    getItem: async (key) => (await delay(), localStorage.getItem(prefix + key) ?? ''),
    getItems: async (keys) =>
      (await delay(), Object.fromEntries(keys.map((k) => [k, localStorage.getItem(prefix + k) ?? '']))),
    setItem: async (key, value) => (await delay(), localStorage.setItem(prefix + key, value), true),
    removeItems: async (keys) => (await delay(), keys.forEach((k) => localStorage.removeItem(prefix + k)), true),
  };
}

const storage = telegramStorage() ?? (localStorage.getItem(MOCK_FLAG) ? mockStorage() : null);

export function cloudAvailable() {
  return storage !== null;
}

async function readMeta() {
  const raw = await storage.getItem(META_KEY);
  return raw ? JSON.parse(raw) : null;
}

const chunkKeys = (gen, n) => Array.from({ length: n }, (_, i) => `${gen}${i}`);

/** Returns the stored object, or null if nothing has been saved yet. */
export async function loadFromCloud() {
  const meta = await readMeta();
  if (!meta) return null;
  const keys = chunkKeys(meta.gen, meta.n);
  const values = await storage.getItems(keys);
  return JSON.parse(keys.map((k) => values[k] ?? '').join(''));
}

export async function saveToCloud(data) {
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push(json.slice(i, i + CHUNK_SIZE));

  const meta = await readMeta();
  const gen = meta?.gen === 'a' ? 'b' : 'a';
  const keys = chunkKeys(gen, chunks.length);
  await Promise.all(keys.map((k, i) => storage.setItem(k, chunks[i])));
  await storage.setItem(META_KEY, JSON.stringify({ gen, n: chunks.length }));

  // The previous generation is no longer referenced. If cleanup fails the keys
  // only take up space; they are never read.
  if (meta) await storage.removeItems(chunkKeys(meta.gen, meta.n)).catch(() => {});
}
