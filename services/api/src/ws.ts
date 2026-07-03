import type { FastifyInstance } from "fastify";
import type { ServerEvent } from "@arena/shared";

/**
 * Real-time fan-out hub (FR-19). Each socket is associated with the user it
 * authenticated as (via a `?token=` query param), so private events — your own
 * verdicts, run results, and the matches you're in — are delivered only to the
 * relevant clients instead of every connected browser. Public events (queue
 * counts, contest leaderboards) still broadcast to everyone.
 *
 * Single-process; for multi-node, back this with a Redis pub/sub fan-out.
 */
interface Client {
  socket: { send: (s: string) => void };
  userId: string | null;
}

const clients = new Set<Client>();

/** Public events: send to every connected client (incl. logged-out viewers). */
export function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const c of clients) {
    try { c.socket.send(payload); } catch { /* drop dead sockets on next tick */ }
  }
}

/** Deliver to every socket authenticated as this user. */
export function sendToUser(userId: string, event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const c of clients) {
    if (c.userId === userId) {
      try { c.socket.send(payload); } catch { /* ignore */ }
    }
  }
}

/** Deliver to every socket authenticated as one of these users. */
export function sendToUsers(userIds: string[], event: ServerEvent): void {
  const set = new Set(userIds);
  const payload = JSON.stringify(event);
  for (const c of clients) {
    if (c.userId && set.has(c.userId)) {
      try { c.socket.send(payload); } catch { /* ignore */ }
    }
  }
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
