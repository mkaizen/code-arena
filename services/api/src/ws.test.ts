import { describe, it, expect, vi } from "vitest";
import type { ServerEvent } from "@arena/shared";

// `deliverLocal` is pure socket routing, but importing ws.ts pulls in the Redis
// client (for the fan-out publish path) which parses required env at load time.
// Stub both so the routing can be tested without a broker or a real config.
vi.mock("./env.js", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));
vi.mock("./redis.js", () => ({ redis: { publish: vi.fn().mockResolvedValue(1) } }));

const { deliverLocal } = await import("./ws.js");
type WsEnvelope = Parameters<typeof deliverLocal>[0];

/**
 * Fake socket that records what it was sent. `boom` sockets throw on send to
 * prove one dead connection can't take out delivery to the healthy ones.
 */
function client(userId: string | null, boom = false) {
  const sent: unknown[] = [];
  return {
    userId,
    sent,
    socket: {
      send: (s: string) => {
        if (boom) throw new Error("dead socket");
        sent.push(JSON.parse(s));
      },
    },
  };
}

const leaderboard: ServerEvent = { type: "leaderboard", contestId: "c1", frozen: false, rows: [] };

describe("deliverLocal — cross-node fan-out routing", () => {
  it("broadcast (kind: all) reaches every socket, including anonymous ones", () => {
    const a = client("u1"), b = client("u2"), anon = client(null);
    const env: WsEnvelope = { kind: "all", event: leaderboard };
    deliverLocal(env, [a, b, anon]);
    expect(a.sent).toEqual([leaderboard]);
    expect(b.sent).toEqual([leaderboard]);
    expect(anon.sent).toEqual([leaderboard]);
  });

  it("kind: user delivers only to that user's sockets, across duplicates", () => {
    const a1 = client("u1"), a2 = client("u1"), other = client("u2"), anon = client(null);
    const event: ServerEvent = { type: "verdict", submissionId: "s1", result: {} as any };
    deliverLocal({ kind: "user", userId: "u1", event }, [a1, a2, other, anon]);
    expect(a1.sent).toEqual([event]);
    expect(a2.sent).toEqual([event]);
    expect(other.sent).toEqual([]);
    expect(anon.sent).toEqual([]);
  });

  it("kind: users delivers to the listed users only", () => {
    const u1 = client("u1"), u2 = client("u2"), u3 = client("u3"), anon = client(null);
    const event: ServerEvent = { type: "match_found", matchId: "m1", playerIds: ["u1", "u2"] };
    deliverLocal({ kind: "users", userIds: ["u1", "u2"], event }, [u1, u2, u3, anon]);
    expect(u1.sent).toEqual([event]);
    expect(u2.sent).toEqual([event]);
    expect(u3.sent).toEqual([]);
    expect(anon.sent).toEqual([]);
  });

  it("a throwing (dead) socket does not stop delivery to the rest", () => {
    const dead = client("u1", true), alive = client("u2");
    expect(() => deliverLocal({ kind: "all", event: leaderboard }, [dead, alive])).not.toThrow();
    expect(alive.sent).toEqual([leaderboard]);
  });
});
