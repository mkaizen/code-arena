import type { FastifyInstance } from "fastify";
import type { ServerEvent } from "@arena/shared";

// In-memory fan-out hub for real-time pushes (FR-19). One process; for multi-node,
// back this with a Redis pub/sub fan-out — left as an integration seam.
const sockets = new Set<{ send: (s: string) => void }>();

export function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  for (const s of sockets) {
    try { s.send(payload); } catch { /* drop dead sockets on next tick */ }
  }
}

export async function wsRoutes(app: FastifyInstance) {
  // @fastify/websocket v10+ passes the raw WebSocket as the first arg
  // (the old `connection.socket` wrapper was removed).
  app.get("/ws", { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
}
