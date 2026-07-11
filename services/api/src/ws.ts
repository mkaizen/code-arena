import type { FastifyInstance } from "fastify";
import type { ServerEvent } from "@arena/shared";
import IORedis from "ioredis";
import { redis } from "./redis.js";
import { env } from "./env.js";

/**
 * Real-time fan-out hub (FR-19). Each socket is associated with the user it
 * authenticated as (via a `?token=` query param), so private events — your own
 * verdicts, run results, and the matches you're in — are delivered only to the
 * relevant clients instead of every connected browser. Public events (queue
 * counts, contest leaderboards) still broadcast to everyone.
 *
 * Multi-node fan-out: a socket only lives in the process it connected to, but
 * an event can be emitted on any api replica (a route handler on node A, the
 * verdict subscriber on node B). So `broadcast`/`sendToUser`/`sendToUsers` do
 * NOT touch local sockets directly — they publish a routing envelope to the
 * Redis `arena:ws` channel, and every node's `startWsBus()` subscriber delivers
 * it to that node's own sockets. One event in, delivered once to every matching
 * socket across the whole cluster (and to this node too, via the round-trip).
 */
export const WS_CHANNEL = "arena:ws";

interface Client {
  socket: { send: (s: string) => void };
  userId: string | null;
}

/**
 * A delivery instruction carried over the fan-out bus. `all` goes to every
 * socket (incl. logged-out viewers); `user`/`users` are scoped to the sockets
 * authenticated as those users.
 */
export type WsEnvelope =
  | { kind: "all"; event: ServerEvent }
  | { kind: "user"; userId: string; event: ServerEvent }
  | { kind: "users"; userIds: string[]; event: ServerEvent };

const clients = new Set<Client>();

/**
 * Deliver a decoded envelope to the sockets connected to THIS process. Pure
 * with respect to the client set (defaults to the live one) so the routing can
 * be unit-tested without a socket server or Redis.
 */
export function deliverLocal(envelope: WsEnvelope, set: Iterable<Client> = clients): void {
  const payload = JSON.stringify(envelope.event);
  const targets =
    envelope.kind === "user" ? new Set([envelope.userId])
    : envelope.kind === "users" ? new Set(envelope.userIds)
    : null; // null => broadcast to all
  for (const c of set) {
    if (targets && (!c.userId || !targets.has(c.userId))) continue;
    try { c.socket.send(payload); } catch { /* drop dead sockets on next tick */ }
  }
}

function publish(envelope: WsEnvelope): void {
  // Fire-and-forget onto the bus; ioredis buffers commands if the connection is
  // briefly down, so a transient Redis blip drops real-time events, not requests.
  redis.publish(WS_CHANNEL, JSON.stringify(envelope)).catch((err) => {
    console.error("ws publish failed", err);
  });
}

/** Public events: send to every connected client (incl. logged-out viewers). */
export function broadcast(event: ServerEvent): void {
  publish({ kind: "all", event });
}

/** Deliver to every socket authenticated as this user. */
export function sendToUser(userId: string, event: ServerEvent): void {
  publish({ kind: "user", userId, event });
}

/** Deliver to every socket authenticated as one of these users. */
export function sendToUsers(userIds: string[], event: ServerEvent): void {
  if (userIds.length === 0) return;
  publish({ kind: "users", userIds, event });
}

/**
 * Subscribe this process to the fan-out bus. Every api replica calls this at
 * boot so events published by any node land on this node's sockets. Uses a
 * dedicated connection because a subscribed ioredis client can't issue other
 * commands.
 */
export function startWsBus(): void {
  const sub = new IORedis(env.REDIS_URL);
  sub.subscribe(WS_CHANNEL, (err) => {
    if (err) console.error("ws bus subscribe failed", err);
    else console.log("ws fan-out bus ready");
  });
  sub.on("message", (_ch: string, msg: string) => {
    try {
      deliverLocal(JSON.parse(msg) as WsEnvelope);
    } catch (err) {
      console.error("ws bus handler error", err);
    }
  });
}

export async function wsRoutes(app: FastifyInstance) {
  // @fastify/websocket v10+ passes the raw WebSocket as the first arg.
  app.get("/ws", { websocket: true }, (socket, req) => {
    // Optional auth: a valid ?token= binds this socket to a user so it can
    // receive that user's private events. Anonymous sockets still get public
    // broadcasts (e.g. live leaderboards on a logged-out page).
    let userId: string | null = null;
    const token = (req.query as { token?: string } | undefined)?.token;
    if (token) {
      try {
        userId = (app.jwt.verify(token) as { sub: string }).sub;
      } catch {
        userId = null;
      }
    }

    const client: Client = { socket, userId };
    clients.add(client);
    socket.on("close", () => clients.delete(client));
  });
}
