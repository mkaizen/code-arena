import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { joinQueue, leaveQueue, queueStatus, getMatchState, getLiveMatches, recordHeartbeat, recordMatchReaction, offerRematch, declineRematch, startPracticeMatch, startAiMatch, MODE_CONFIG } from "../match/engine.js";
import { aiConfigured, aiOpponentName } from "../ai/provider.js";
import { getMatchReplay } from "../match/replay.js";
import { prisma } from "../db.js";
import type { MatchHistoryEntry, MatchMode } from "@arena/shared";

const queueBody = z.object({ mode: z.enum(["ROYALE", "QUADS", "DUEL"]).default("ROYALE") });
const reactBody = z.object({ emoji: z.string() });
const aiBody = z.object({ difficulty: z.enum(["easy", "med", "hard"]).default("med") });

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

  // Whether "Challenge the AI" is available, and the opponent's name — the web
  // app hides the entry point entirely when the feature isn't configured.
  app.get("/matches/ai/config", async () => {
    const enabled = aiConfigured();
    return { enabled, opponent: enabled ? aiOpponentName() : null };
  });

  // Start an unrated duel against the LLM opponent. Capped per IP so the model
  // budget can't be drained; 404s cleanly when the feature isn't configured.
  app.post("/matches/ai", {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    if (!aiConfigured()) return reply.code(404).send({ error: "AI opponent is not available" });
    const { difficulty } = aiBody.parse(req.body ?? {});
    try {
      const { matchId } = await startAiMatch(req.user.sub, difficulty);
      return { matchId };
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  });

  app.post("/matches/:id/heartbeat", { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await recordHeartbeat(id, req.user.sub);
    return { ok: true };
  });

  // Fire an emote to everyone in the match. Ephemeral and best-effort: the
  // engine validates the emoji, participation, live-match state, and per-user
  // cooldown, and simply reports whether the reaction was delivered.
  app.post("/matches/:id/react", { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { emoji } = reactBody.parse(req.body ?? {});
    const sent = await recordMatchReaction(id, req.user.sub, emoji);
    return { sent };
  });

  // Offer/accept a rematch of a finished duel — starts a new match with the
  // same two players once both opt in.
  app.post("/matches/:id/rematch", { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    return offerRematch(id, req.user.sub);
  });

  app.post("/matches/:id/rematch/decline", { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await declineRematch(id, req.user.sub);
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

  // Public, unauthenticated: the "Live now" list for spectator discovery —
  // in-progress ranked matches anyone can drop in on.
  app.get("/matches/live", async () => {
    return getLiveMatches();
  });

  // Public, unauthenticated: a live match's state for a spectator. Unlike a
  // participant's /matches/:id, this only exposes matches that are ACTIVE and
  // never a single line of anyone's source — just the same rounds, standings,
  // and problem a spectator watches unfold. Live WebSocket updates come from a
  // `{type:"spectate"}` subscription on the socket.
  app.get("/matches/:id/live", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await getMatchState(id);
    if (!state || state.status !== "ACTIVE") return reply.code(404).send({ error: "not found" });
    return state;
  });
}
