/**
 * Launch cache (performance plan Slice 10): tiny localStorage JSON cache for
 * the online section so re-opening Online Manga/Books paints the last
 * session's content instantly instead of a skeleton. Strictly bounded: keys
 * are prefixed, the whole cache is pruned on every write, and a per-entry TTL
 * keeps data fresh.
 */
const PREFIX = 'shiori-launch:';
const TTL_MS = 24 * 60 * 60 * 1000;
/** Absolute cap on cached payloads — keeps localStorage tiny (memory guardrail). */
const MAX_ENTRIES = 40;

/** Tests must be isolated: no persistence under vitest. */
const IS_TEST = import.meta.env?.MODE === 'test';

interface Entry<T> {
  at: number;
  data: T;
}

function allKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    return keys;
  } catch {
    return [];
  }
}

function prune(): void {
  try {
    const keys = allKeys();
    if (keys.length <= MAX_ENTRIES) return;
    // Drop oldest entries first.
    const withAge = keys
      .map((k) => {
        try {
          const raw = localStorage.getItem(k);
          const e = raw ? (JSON.parse(raw) as Entry<unknown>) : null;
          return { k, at: e?.at ?? 0 };
        } catch {
          return { k, at: 0 };
        }
      })
      .sort((a, b) => a.at - b.at);
    for (const { k } of withAge.slice(0, keys.length - MAX_ENTRIES)) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors — never break the reader.
  }
}

export function launchCacheGet<T>(key: string): T | null {
  if (IS_TEST) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (Date.now() - e.at > TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return e.data;
  } catch {
    return null;
  }
}

export function launchCacheSet(key: string, data: unknown): void {
  if (IS_TEST) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    prune();
  } catch {
    // Quota exceeded / blocked — skip caching.
  }
}

export function launchCacheClear(): void {
  if (IS_TEST) return;
  for (const k of allKeys()) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}