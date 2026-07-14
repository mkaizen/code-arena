import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { joinQueue, leaveQueue, queueStatus, getMatchState, recordHeartbeat, startPracticeMatch, MODE_CONFIG } from "../match/engine.js";
import { getMatchReplay } from "../match/replay.js";
import { prisma } from "../db.js";
import type { MatchHistoryEntry, MatchMode } from "@arena/shared";

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

  // Start an unrated practice match against bots — no queue, begins immediately.
  app.post("/matches/practice", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mode } = queueBody.parse(req.body ?? {});
    try {
      const { matchId } = await startPracticeMatch(req.user.sub, mode);
      return { matchId };
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  });

  app.get("/matches/queue/status", { onRequest: [app.authenticate] }, async (req) => {
    return queueStatus(req.user.sub);
  });

  app.post("/matches/:id/heartbeat", { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await recordHeartbeat(id, req.user.sub);
    return { ok: true };
  });

  // W/L record + recent finished matches for the profile page.
  app.get("/matches/history", { onRequest: [app.authenticate] }, async (req) => {
    const userId = req.user.sub;
    const rows = await prisma.matchPlayer.findMany({
      where: { userId, match: { status: "FINISHED" } },
      orderBy: { match: { endedAt: "desc" } },
      take: 20,
      include: { match: { select: { id: true, mode: true, endedAt: true, _count: { select: { players: true } } } } },
    });
    const matches: MatchHistoryEntry[] = rows.map((r) => ({
      matchId: r.match.id,
      mode: r.match.mode as MatchMode,
      placement: r.placement,
      playerCount: r.match._count.players,
      won: r.placement === 1,
      ratingBefore: r.ratingBefore,
      ratingAfter: r.ratingAfter,
      endedAt: r.match.endedAt?.toISOString() ?? null,
    }));

    // Record spans all finished matches, not just the recent page.
    const all = await prisma.matchPlayer.findMany({
      where: { userId, match: { status: "FINISHED" } },
      select: { placement: true },
    });
    const wins = all.filter((p) => p.placement === 1).length;
    return { record: { wins, losses: all.length - wins, played: all.length }, matches };
  });

  app.get("/matches/:id", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await getMatchState(id);
    if (!state) return reply.code(404).send({ error: "not found" });
    return state;
  });

  // Public, unauthenticated: a finished match's result, for the shareable
  // /share/:id card. Only ever exposes FINISHED matches — an in-progress
  // match is never handed to anonymous viewers (that's still private to its
  // players over the WebSocket), so there's nothing to spoil by sharing.
  app.get("/matches/:id/public", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await getMatchState(id);
    if (!state || state.status !== "FINISHED") return reply.code(404).send({ error: "not found" });
    return state;
  });

  // Public, unauthenticated: a finished match reconstructed as a round-by-round
  // "game review" + chronological submission feed for the /replay/:id page.
  app.get("/matches/:id/replay", async (req, reply) => {
    const { id } = req.params as { id: string };
    const replay = await getMatchReplay(id);
    if (!replay) return reply.code(404).send({ error: "not found" });
    return replay;
  });
}
