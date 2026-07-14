---
title: "One Emit, Every Node: Fanning Out WebSockets Across a Cluster"
date: "2026-06-30"
author: "Matthew"
description: "Scaling Code Arena's real-time layer past a single API process — routing every WebSocket event through a Redis bus so a socket on node A receives an event emitted on node B, and using a SET NX claim to make judge side-effects fire exactly once cluster-wide."
---

# One Emit, Every Node: Fanning Out WebSockets Across a Cluster

An [earlier post](/blog/scaling-the-arena) walked through Code Arena's real-time layer: judge workers publish verdicts to Redis, the API subscribes once and fans each result out to the right browser over a WebSocket. That design has a quiet assumption baked into it — that there's exactly **one** API process. The moment you run a second replica behind a load balancer, the whole thing springs a leak. This post is about the leak and the fix, because it's a textbook example of how a single-node real-time design breaks under horizontal scaling, and the two distinct problems you have to solve to make it right.

## The bug you don't see until the second replica

Here's the setup. Sockets are stateful: a browser opens a WebSocket to `/ws`, and that connection lives *inside one specific process* — whichever API replica the load balancer happened to route it to. Call it node A.

Now an event needs to be sent to that user. But events are emitted from anywhere:

- A route handler processes an HTTP request — but the load balancer may have sent that request to node **B**.
- The verdict subscriber picks up a finished judge result — but that subscriber is running on node **C**.

In the single-node world these are all the same process, so "send to this user's socket" just means walking a local `Set` of connections. With multiple replicas, node B's route handler walks node B's local set, finds *nothing* (the user's socket lives on A), and the event silently evaporates. The user's browser sits there waiting for a verdict that was delivered into the void.

The symptom is maddening because it's probabilistic. With two replicas, a socket and an event land on the same node about half the time, so half your real-time updates just… don't arrive, seemingly at random. Everything works perfectly in local dev where there's only one process. It only breaks in production, only under a load balancer, and only intermittently.

## Fix part 1: route every event through a shared bus

The core problem is that emitting an event and holding the socket are decoupled across processes, so the emit has to reach *every* process, not just the local one. The fix is to stop touching local sockets directly and instead publish every outbound event to a Redis pub/sub channel that all nodes subscribe to.

The public API doesn't change at all — callers still write `broadcast(...)`, `sendToUser(...)`, `sendToUsers(...)`. What changes is that those functions no longer deliver; they *publish a routing envelope*:

```typescript
export type WsEnvelope =
  | { kind: "all"; event: ServerEvent }
  | { kind: "user"; userId: string; event: ServerEvent }
  | { kind: "users"; userIds: string[]; event: ServerEvent };

export function broadcast(event: ServerEvent): void {
  publish({ kind: "all", event });
}
export function sendToUser(userId: string, event: ServerEvent): void {
  publish({ kind: "user", userId, event });
}
export function sendToUsers(userIds: string[], event: ServerEvent): void {
  if (userIds.length === 0) return;
  publish({ kind: "users", userIds, event });
}
```

The envelope carries both the event *and its routing intent* — is this for everyone, one user, or a specific set of users? Publishing is fire-and-forget onto the `arena:ws` channel:

```typescript
function publish(envelope: WsEnvelope): void {
  redis.publish(WS_CHANNEL, JSON.stringify(envelope)).catch((err) => {
    console.error("ws publish failed", err);
  });
}
```

Every replica runs a subscriber at boot that receives *every* published envelope and applies the routing against its own local sockets:

```typescript
export function startWsBus(): void {
  const sub = new IORedis(env.REDIS_URL);
  sub.subscribe(WS_CHANNEL, (err) => { /* ... */ });
  sub.on("message", (_ch, msg) => {
    deliverLocal(JSON.parse(msg) as WsEnvelope);
  });
}
```

And `deliverLocal` is where the routing intent finally meets actual connections — the only place local sockets are touched:

```typescript
export function deliverLocal(envelope: WsEnvelope, set: Iterable<Client> = clients): void {
  const payload = JSON.stringify(envelope.event);
  const targets =
    envelope.kind === "user"  ? new Set([envelope.userId])
    : envelope.kind === "users" ? new Set(envelope.userIds)
    : null; // null => broadcast to all
  for (const c of set) {
    if (targets && (!c.userId || !targets.has(c.userId))) continue;
    try { c.socket.send(payload); } catch { /* drop dead sockets next tick */ }
  }
}
```

So the full path for a single event is: one node publishes → Redis fans the message to all subscribers → *every* node runs `deliverLocal` against its own sockets. The node that happens to hold the target socket delivers it; every other node runs the same filter, matches nothing, and no-ops harmlessly. The emitting node included — it delivers to its own sockets via the round-trip through Redis, not via a special local path, so there's exactly one code path and no "did I already handle this locally?" bookkeeping.

Note the privacy scoping survives the trip intact. A `user`/`users` envelope only ever matches sockets that *authenticated* as one of those user IDs — an anonymous socket (`c.userId` is `null`) is skipped for any targeted event but still receives broadcasts. So a logged-out spectator watching a live leaderboard gets the public `broadcast` but never another player's private verdict, exactly as before. Horizontal scaling didn't loosen the information boundaries.

### A design nicety: the routing is a pure function

`deliverLocal` takes its client set as a parameter (defaulting to the live one). That's not an accident — it means the entire routing decision (all vs. user vs. users, anonymous handling, dead-socket isolation) can be unit-tested by passing in a fake set of clients, with no socket server and no Redis anywhere in the test. The distributed machinery is thin glue around a pure core, which is where all the tricky branching lives.

## Fix part 2: the same message now hits every node — including the ones with side-effects

Broadcasting solved delivery, but it created a second, subtler problem, and this one is a data-integrity bug rather than a missing-update bug.

Go back to the verdict subscriber. It doesn't *only* fan out a WebSocket message — when a submission is accepted in a rated contest, it also does real work with lasting consequences:

- recomputes the user's contest standing and records it,
- resolves a Battle Royale match if the submission belongs to one,
- updates daily-challenge streaks,
- writes a fresh leaderboard and broadcasts it.

In the single-node world, exactly one process subscribed to `arena:verdicts`, so all of that ran once. But the whole point of the fix above is that *every* replica now subscribes to the judge channels. Which means a single judge verdict is delivered to all N replicas, and if each one runs the handler, the standing gets recorded N times, the match-resolution logic fires N times, the streak counter increments N times. Going multi-node turned an idempotent-by-accident handler into a duplicate-writes-by-default one.

Pub/sub gives *at-least-once-per-subscriber* delivery; what these side-effects need is *exactly-once-cluster-wide*. That's a real distributed-systems gap, and the fix is a distributed lock — a claim that exactly one node wins:

```typescript
async function claim(key: string, ttlSec = 120): Promise<boolean> {
  const res = await redis.set(key, "1", "EX", ttlSec, "NX");
  return res === "OK";
}
```

`SET key value NX` is Redis's atomic compare-and-set: it writes the key *only if it doesn't already exist*, and tells you whether you were the one who created it. When a verdict arrives on all N nodes simultaneously, all N race to `SET arena:verdict-done:<submissionId> NX` — Redis serializes them, exactly one gets `"OK"`, and the rest get `null`. The winner processes; the losers bail on the first line:

```typescript
const { submissionId, result } = JSON.parse(msg) as VerdictMsg;
// One node owns each verdict's side-effects + fan-out; the others no-op.
if (!(await claim(`arena:verdict-done:${submissionId}`))) return;
```

The same claim guards run results (`arena:run-done:<runId>`) so a debug-run message is delivered to its author exactly once, not once per replica.

### Why the TTL matters

The claim key isn't permanent — it expires after 120 seconds. That expiry is a deliberate safety net for the ugly case: what if the node that *won* the claim crashes halfway through the handler, after recording the standing but before broadcasting the leaderboard? If the key lived forever, that submission would be permanently "done" and never fully processed. With a TTL, the claim eventually evaporates, and a later retry (say, a redelivery or a re-judge) can pick the work back up. It's the standard tension in distributed locks — a lock that outlives its holder deadlocks the work; one that expires too soon lets two workers run at once. 120 seconds comfortably exceeds the handler's runtime while still bounding how long a crash can wedge a message.

This does mean the side-effects should tolerate a rare re-run rather than assume strict once-ever execution — which is why the standing computation is written to *recompute from scratch and record*, not *increment*. Idempotent-on-replay is the right posture when your safety net is a TTL.

## The general shape

Strip away the specifics and there's a pattern here that recurs any time you scale a stateful real-time layer horizontally:

1. **Connections are pinned to one node; events originate on any node.** Anything that sends to a connection has to reach the node that owns it, so route sends through a shared bus every node subscribes to — don't touch local state directly.
2. **A shared bus delivers to every node, so anything with side-effects now runs N times.** Separate *delivery* (which genuinely wants to reach every node, to find the one socket) from *side-effects* (which must happen once), and gate the side-effects behind an atomic cluster-wide claim.
3. **Make the claim expire.** A permanent claim turns a mid-handler crash into permanently-dropped work; a TTL trades that for a rare, tolerable re-run — so write the side-effects to survive a replay.

None of the individual pieces are exotic — Redis pub/sub, a `SET NX` lock, a routing envelope. As with most of Code Arena's real-time work, the correctness lives in the *seams*: which events cross process boundaries, which side-effects must be claimed before they run, and keeping the pure routing logic testable in isolation from all the distributed plumbing around it.
