import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { joinQueue, leaveQueue, queueStatus, getMatchState, MODE_CONFIG } from "../match/engine.js";

const queueBody = z.object({ mode: z.enum(["ROYALE", "DUEL"]).default("ROYALE") });

export async function matchRoutes(app: FastifyInstance) {
  app.post("/matches/queue", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mode } = queueBody.parse(req.body ?? {});
    try {
      const result = await joinQueue(req.user.sub, mode);
      const capacity = MODE_CONFIG[mode].capacity;
      if (result.matched) return { matched: true, matchId: result.matchId, count: capacity, capacity };
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
