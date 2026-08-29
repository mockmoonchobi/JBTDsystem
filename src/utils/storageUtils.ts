/**
 * Robust, Quota-Safe Persistent Storage Manager
 * Handles unlimited records (tens of thousands to hundreds of thousands) without localStorage 5MB quota truncation.
 * Table datasets are stored directly in IndexedDB, completely bypassing localStorage limits.
 */

const DB_NAME = 'TempleManagementDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

// Keys that contain large arrays of table records and should NEVER be stored in localStorage (5MB limit)
export const TABLE_STORAGE_KEYS = new Set<string>([
  'temple_households',
  'temple_past_records',
  'temple_transactions',
  'temple_memorial_services',
  'temple_todos',
  'temple_family_members',
  'temple_safety_snapshot',
  'temple_backup_before_sync',
]);

// In-memory cache for fast synchronous access
const memoryStateCache = new Map<string, any>();

// IndexedDB connection instance and promise cache
let activeDB: IDBDatabase | null = null;
let openDBPromise: Promise<IDBDatabase> | null = null;

function resetDBConnection(): void {
  if (activeDB) {
    try {
      activeDB.close();
    } catch (_) {}
    activeDB = null;
  }
  openDBPromise = null;
}

if (typeof window !== 'undefined') {
  // Listen for tab/window visibility or page lifecycle events that might close IDB
  window.addEventListener('pagehide', () => {
    resetDBConnection();
  });
}

function getIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }

  // If we already have a healthy open database, return it
  if (activeDB) {
    return Promise.resolve(activeDB);
  }

  if (!openDBPromise) {
    openDBPromise = new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          activeDB = db;

          // Handle unexpected connection closure or version changes
          db.onversionchange = () => {
            resetDBConnection();
          };
          db.onclose = () => {
            resetDBConnection();
          };
          db.onerror = () => {
            resetDBConnection();
          };

          resolve(db);
        };

        request.onerror = () => {
          openDBPromise = null;
          reject(request.error || new Error('Failed to open IndexedDB'));
        };

        request.onblocked = () => {
          console.warn('[IndexedDB] Database open blocked. Resetting connection.');
          resetDBConnection();
        };
      } catch (err) {
        openDBPromise = null;
        reject(err);
      }
    });
  }

  return openDBPromise;
}

/**
 * Execute an IndexedDB transaction with automatic retry on connection closure / invalid state
 */
async function withStore<R>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<R>,
  retries = 2
): Promise<R> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const db = await getIDB();
      return await new Promise<R>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);

          tx.onerror = () => {
            const err = tx.error || new Error('IndexedDB transaction error');
            reject(err);
          };

          tx.onabort = () => {
            const err = tx.error || new Error('IndexedDB transaction aborted');
            reject(err);
          };

          operation(store)
            .then(resolve)
            .catch(reject);
        } catch (txInitErr) {
          // If transaction creation failed (e.g. database closing or invalid state), reject immediately to trigger reconnect retry
          reject(txInitErr);
        }
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isConnectionClosing =
        err?.name === 'InvalidStateError' ||
        errMsg.includes('closing') ||
        errMsg.includes('closed') ||
        errMsg.includes('hidden') ||
        errMsg.includes('database connection');

      resetDBConnection();

      if (attempt < retries && isConnectionClosing) {
        // Wait a tiny moment before reconnecting
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('IndexedDB operation failed after retries');
}

export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const result = await withStore<T | null>('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const res = req.result !== undefined ? (req.result as T) : null;
          resolve(res);
        };
        req.onerror = () => reject(req.error);
      });
    });

    if (result !== null) {
      memoryStateCache.set(key, result);
    }
    return result;
  } catch (e) {
    console.warn(`[IndexedDB] Error reading key "${key}":`, e);
    return memoryStateCache.has(key) ? (memoryStateCache.get(key) as T) : null;
  }
}

export async function idbSet<T = any>(key: string, value: T): Promise<void> {
  memoryStateCache.set(key, value);
  try {
    await withStore<void>('readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  } catch (e) {
    console.warn(`[IndexedDB] Error writing key "${key}":`, e);
  }
}

export async function idbRemove(key: string): Promise<void> {
  memoryStateCache.delete(key);
  try {
    await withStore<void>('readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  } catch (e) {
    console.warn(`[IndexedDB] Error removing key "${key}":`, e);
  }
}

export async function idbClear(): Promise<void> {
  memoryStateCache.clear();
  try {
    await withStore<void>('readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  } catch (e) {
    console.warn('[IndexedDB] Error clearing database:', e);
  }
}

/**
 * Safe localStorage wrapper for small settings, options, and preferences only.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    // If it's a large table key, don't read from localStorage (which may contain old 5000-record truncated data)
    if (TABLE_STORAGE_KEYS.has(key)) {
      return null;
    }
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn(`[safeStorage] Error getting item "${key}":`, e);
      return null;
    }
  },

  setItem(key: string, value: string): boolean {
    // Large table data must NOT go to localStorage to prevent quota exhaustion and truncation bugs
    if (TABLE_STORAGE_KEYS.has(key)) {
      // Purge any stale entry in localStorage if present
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (_) {}
      return true;
    }

    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(key, value);
      // Also mirror to IndexedDB asynchronously
      idbSet(key, value).catch(() => {});
      return true;
    } catch (e: any) {
      console.warn(
        `[safeStorage] localStorage quota exceeded while saving "${key}". Persisting to IndexedDB instead.`,
        e?.message || e
      );

      try {
        idbSet(key, value).catch((idbErr) => {
          console.error(`[safeStorage] IndexedDB fallback also failed for "${key}":`, idbErr);
        });
      } catch (err) {
        console.error(`[safeStorage] IndexedDB fallback exception for "${key}":`, err);
      }
      return false;
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      idbRemove(key).catch(() => {});
    } catch (e) {
      console.warn(`[safeStorage] Error removing item "${key}":`, e);
    }
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      idbClear().catch(() => {});
    } catch (e) {
      console.warn('[safeStorage] Error clearing storage:', e);
    }
  }
};

/**
 * Helper to safely save state objects.
 * Automatically routes large table datasets directly to IndexedDB to prevent 5,000-record / 5MB browser truncation.
 */
export function saveJsonState<T>(key: string, data: T): void {
  try {
    memoryStateCache.set(key, data);

    if (TABLE_STORAGE_KEYS.has(key)) {
      // Large table dataset: save directly to IndexedDB without localStorage size limitations
      idbSet(key, data).catch((e) => console.warn(`[saveJsonState] IDB save error for "${key}":`, e));

      // Remove any historical truncated data from localStorage to free browser quota
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (_) {}
    } else {
      // Small config / metadata
      const jsonStr = JSON.stringify(data);
      safeStorage.setItem(key, jsonStr);
      idbSet(key, data).catch(() => {});
    }
  } catch (e) {
    console.warn(`[saveJsonState] Error saving key "${key}":`, e);
  }
}

/**
 * Helper to safely load JSON objects with a fallback.
 */
export function loadJsonState<T>(key: string, defaultValue: T): T {
  if (memoryStateCache.has(key)) {
    return memoryStateCache.get(key) as T;
  }
  if (TABLE_STORAGE_KEYS.has(key)) {
    // Table datasets are loaded asynchronously from IndexedDB during app initialization
    return defaultValue;
  }
  try {
    const raw = safeStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[loadJsonState] Error parsing JSON for key "${key}":`, e);
    return defaultValue;
  }
}
