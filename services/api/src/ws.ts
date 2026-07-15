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
  /** Match ids this socket is spectating (see `spectate`/`unspectate`). */
  spectating?: Set<string>;
}

/** Most matches a single socket may spectate at once — a guard against abuse. */
const MAX_SPECTATE = 6;

/**
 * A delivery instruction carried over the fan-out bus. `all` goes to every
 * socket (incl. logged-out viewers); `user`/`users` are scoped to the sockets
 * authenticated as those users; `spectators` goes to sockets watching a match.
 */
export type WsEnvelope =
  | { kind: "all"; event: ServerEvent }
  | { kind: "user"; userId: string; event: ServerEvent }
  | { kind: "users"; userIds: string[]; event: ServerEvent }
  | { kind: "spectators"; matchId: string; event: ServerEvent };

const clients = new Set<Client>();

/**
 * Deliver a decoded envelope to the sockets connected to THIS process. Pure
 * with respect to the client set (defaults to the live one) so the routing can
 * be unit-tested without a socket server or Redis.
 */
export function deliverLocal(envelope: WsEnvelope, set: Iterable<Client> = clients): void {
  const payload = JSON.stringify(envelope.event);
  for (const c of set) {
    if (!matches(envelope, c)) continue;
    try { c.socket.send(payload); } catch { /* drop dead sockets on next tick */ }
  }
}

/** Whether a socket should receive an envelope, by its routing kind. */
function matches(envelope: WsEnvelope, c: Client): boolean {
  switch (envelope.kind) {
    case "all": return true;
    case "user": return c.userId === envelope.userId;
    case "users": return c.userId != null && envelope.userIds.includes(c.userId);
    case "spectators": return c.spectating?.has(envelope.matchId) ?? false;
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

/** Deliver to every socket currently spectating this match. */
export function sendToSpectators(matchId: string, event: ServerEvent): void {
  publish({ kind: "spectators", matchId, event });
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

    const client: Client = { socket, userId, spectating: new Set() };
    clients.add(client);

    // Inbound control messages. The only one today is spectating: a socket asks
    // to follow a live match (`{type:"spectate",matchId}`) and starts receiving
    // that match's state/feed/reactions, or drops it (`unspectate`). Anonymous
    // sockets can spectate — watching a public match needs no login.
    socket.on("message", (raw: unknown) => {
      let msg: { type?: string; matchId?: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return; // ignore malformed frames
      }
      if (typeof msg.matchId !== "string") return;
      if (msg.type === "spectate") {
        if (client.spectating!.size < MAX_SPECTATE) client.spectating!.add(msg.matchId);
      } else if (msg.type === "unspectate") {
        client.spectating!.delete(msg.matchId);
      }
    });

    socket.on("close", () => clients.delete(client));
  });
}
