/**
 * Tiny in-process TTL cache for hot *public* read endpoints (global leaderboard,
 * problem archive + stats). Per-replica and dependency-free — its only job is to
 * shield Postgres from an anonymous read storm (e.g. a launch-day traffic spike):
 * worst case each replica runs one query per key per TTL window instead of one
 * per request. Not for per-user, authenticated, or write paths.
 *
 * Concurrent callers on a cold or just-expired key share a single in-flight load
 * (the Promise is cached, not just its result), so a thundering herd collapses to
 * one query rather than hundreds. A rejected load is evicted so it is never
 * cached and the next caller retries.
 */
interface Entry<T> {
  value: Promise<T>;
  expires: number;
}

export interface TtlCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, Entry<T>>();
  return {
    get(key, load) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) return hit.value;

      const value = load();
      store.set(key, { value, expires: now + ttlMs });
      // Never cache a failure: drop the entry if this load rejected, unless a
      // newer load has already replaced it.
      value.catch(() => {
        if (store.get(key)?.value === value) store.delete(key);
      });
      return value;
    },
    clear() {
      store.clear();
    },
  };
}
