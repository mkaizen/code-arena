import { describe, it, expect, vi } from "vitest";
import { createTtlCache } from "./cache.js";

describe("createTtlCache", () => {
  it("serves a cached value within the TTL without reloading", async () => {
    const cache = createTtlCache<number>(1000);
    const load = vi.fn(async () => 42);
    expect(await cache.get("k", load)).toBe(42);
    expect(await cache.get("k", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the TTL has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const cache = createTtlCache<number>(1000);
      let n = 0;
      const load = vi.fn(async () => ++n);
      expect(await cache.get("k", load)).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(await cache.get("k", load)).toBe(2);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys entries independently", async () => {
    const cache = createTtlCache<string>(1000);
    expect(await cache.get("a", async () => "A")).toBe("A");
    expect(await cache.get("b", async () => "B")).toBe("B");
    expect(await cache.get("a", async () => "changed")).toBe("A");
  });

  it("collapses concurrent cold loads into a single call (herd protection)", async () => {
    const cache = createTtlCache<number>(1000);
    const load = vi.fn(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(7), 10)),
    );
    const [a, b, c] = await Promise.all([
      cache.get("k", load),
      cache.get("k", load),
      cache.get("k", load),
    ]);
    expect([a, b, c]).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejected load — the next caller retries", async () => {
    const cache = createTtlCache<number>(1000);
    await expect(cache.get("k", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // A subsequent call must re-run rather than replay the failure.
    expect(await cache.get("k", async () => 99)).toBe(99);
  });

  it("clear() drops all entries", async () => {
    const cache = createTtlCache<number>(1000);
    const load = vi.fn(async () => 1);
    await cache.get("k", load);
    cache.clear();
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
