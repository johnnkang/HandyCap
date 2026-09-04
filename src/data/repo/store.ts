/**
 * A minimal key/value store.
 *
 * The repository is written against this rather than IndexedDB directly, so the
 * persistence logic can be tested without a browser and so a different backing
 * store (a sync service, say) can be dropped in later.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return values.get(key) as T | undefined
    },
    async set<T>(key: string, value: T) {
      // Round-trip through JSON so the in-memory store behaves like a real one:
      // callers cannot accidentally rely on holding the same object reference.
      values.set(key, JSON.parse(JSON.stringify(value)))
    },
    async remove(key: string) {
      values.delete(key)
    },
  }
}

/** IndexedDB-backed store, used by the running app. */
export function createIndexedDbStore(): KeyValueStore {
  return {
    async get<T>(key: string) {
      const { get } = await import('idb-keyval')
      return (await get(key)) as T | undefined
    },
    async set<T>(key: string, value: T) {
      const { set } = await import('idb-keyval')
      await set(key, value)
    },
    async remove(key: string) {
      const { del } = await import('idb-keyval')
      await del(key)
    },
  }
}
