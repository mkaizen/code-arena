import type { FastifyInstance } from "fastify";
import { joinQueue, leaveQueue, queueStatus, getMatchState, MATCH_CAPACITY } from "../match/engine.js";

export async function matchRoutes(app: FastifyInstance) {
  app.post("/matches/queue", { onRequest: [app.authenticate] }, async (req, reply) => {
    try {
      const result = await joinQueue(req.user.sub);
      if (result.matched) return { matched: true, matchId: result.matchId, count: MATCH_CAPACITY, capacity: MATCH_CAPACITY };
      return { matched: false, matchId: undefined, count: result.count, capacity: result.capacity };
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  });

  app.delete("/matches/queue", { onRequest: [app.authenticate] }, async (req) => {
    await leaveQueue(req.user.sub);
    return { ok: true };
  });

  app.get("/matches/queue/status", { onRequest: [app.authenticate] }, async (req) => {
    return queueStatus(req.user.sub);
  });

  app.get("/matches/:id", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await getMatchState(id);
    if (!state) return reply.code(404).send({ error: "not found" });
    return state;
  });
}
