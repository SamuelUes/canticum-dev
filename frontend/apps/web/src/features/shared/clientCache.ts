type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
};

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readClientCache<T>(key: string): T | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = safeParse<CacheEnvelope<T>>(raw);
    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(key);
      return null;
    }

    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, value: T, ttlMs: number): void {
  if (!hasWindow()) {
    return;
  }

  try {
    const envelope: CacheEnvelope<T> = {
      expiresAt: Date.now() + Math.max(0, ttlMs),
      value
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
  }
}

export function removeClientCache(key: string): void {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
  }
}

export function removeClientCacheByPrefix(prefix: string): void {
  if (!hasWindow()) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
  }
}

export function removeSessionCacheByPrefix(prefix: string): void {
  if (!hasWindow()) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.sessionStorage.removeItem(key);
    });
  } catch {
  }
}

export function clearAllAppCache(): void {
  if (!hasWindow()) {
    return;
  }

  const localStoragePrefixes = [
    'canticum:',
    'song-preferences:',
    'song-favorite:',
    'canticum:artist:detail:v1:',
    'canticum:artist:favorite:v1:',
    'canticum:repertoires:list:v1:',
    'canticum:repertoires:detail:v1:',
    'canticum:song:detail:v1:',
    'canticum:song:title:v1:',
    'canticum:subscription:plans:v1',
    'canticum:album:detail:v1:',
    'canticum:album:artist-list:v1:',
    'canticum:account:summary:v1:',
    'canticum:bookmarks:v1:'
  ];

  const sessionStoragePrefixes = [
    '__canticum_search_dataset_cache_v1__:',
    '__canticum_'
  ];

  localStoragePrefixes.forEach((prefix) => {
    removeClientCacheByPrefix(prefix);
  });

  sessionStoragePrefixes.forEach((prefix) => {
    removeSessionCacheByPrefix(prefix);
  });
}
