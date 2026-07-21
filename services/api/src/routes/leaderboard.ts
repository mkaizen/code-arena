import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getLeaderboard, isFrozen, ensureFreezeSnapshot } from "../leaderboard/freeze.js";
import { createTtlCache } from "../cache.js";

// The global board changes slowly (only on rated finalizations) but is a prime
// anonymous-read target — shield the full-table sort behind a short TTL.
const globalBoardCache = createTtlCache<{ handle: string; rating: number }[]>(10_000);

export async function leaderboardRoutes(app: FastifyInstance) {
  // FR-19: live contest leaderboard, subject to freeze.
  app.get("/contests/:id/leaderboard", async (req, reply) => {
    const { id } = req.params as { id: string };
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) return reply.code(404).send({ error: "not found" });

    const frozen = isFrozen(contest);
    if (frozen) await ensureFreezeSnapshot(id);
    const rows = await getLeaderboard(id, contest.scoring, frozen);
    return reply.send({ frozen, rows });
  });

  // FR-20: global all-time leaderboard by rating.
  app.get("/leaderboard/global", async (_req, reply) => {
    const rows = await globalBoardCache.get("global", () =>
      prisma.user.findMany({
        where: { isBot: false, guest: false },
        orderBy: { rating: "desc" },
        take: 200,
        select: { handle: true, rating: true },
      }),
    );
    // Let a CDN/proxy absorb the crowd too; matches the server-side TTL.
    reply.header("Cache-Control", "public, max-age=10");
    return rows;
  });

  // Humans-vs-AI scoreboard: each AI opponent's record against human players,
  // plus a hall of registered players who have beaten it. Aggregated from
  // finished "Challenge the AI" duels.
  app.get("/leaderboard/ai", async () => {
    const [matches, vsMatches] = await Promise.all([
      prisma.match.findMany({
        where: { aiDuel: true, status: "FINISHED" },
        orderBy: { endedAt: "desc" },
        take: 5000,
        select: {
          players: {
            select: { placement: true, user: { select: { isBot: true, guest: true, handle: true } } },
          },
        },
      }),
      prisma.match.findMany({
        where: { aiVsAi: true, status: "FINISHED" },
        orderBy: { endedAt: "desc" },
        take: 5000,
        select: { players: { select: { placement: true, user: { select: { handle: true, rating: true } } } } },
      }),
    ]);

    const models = new Map<string, { name: string; played: number; aiWins: number; humanWins: number; draws: number }>();
    const champions = new Map<string, { handle: string; wins: number; games: number }>();

    for (const m of matches) {
      const ai = m.players.find((p) => p.user.isBot);
      const human = m.players.find((p) => !p.user.isBot);
      if (!ai || !human) continue;

      const rec = models.get(ai.user.handle) ?? { name: ai.user.handle, played: 0, aiWins: 0, humanWins: 0, draws: 0 };
      rec.played++;
      const draw = ai.placement === 1 && human.placement === 1;
      const humanWon = human.placement === 1 && !draw;
      if (draw) rec.draws++;
      else if (humanWon) rec.humanWins++;
      else rec.aiWins++;
      models.set(ai.user.handle, rec);

      // Only registered players make the hall — throwaway guest handles are noise.
      if (!human.user.guest) {
        const c = champions.get(human.user.handle) ?? { handle: human.user.handle, wins: 0, games: 0 };
        c.games++;
        if (humanWon) c.wins++;
        champions.set(human.user.handle, c);
      }
    }

    // Model-vs-model standings from AI-vs-AI exhibitions, carrying each model's
    // current Elo (its opponent-bot's live rating, updated after every match).
    const standings = new Map<string, { name: string; rating: number; played: number; wins: number; losses: number; draws: number }>();
    for (const m of vsMatches) {
      if (m.players.length < 2) continue;
      const draw = m.players.filter((p) => p.placement === 1).length > 1;
      for (const p of m.players) {
        const s = standings.get(p.user.handle) ?? { name: p.user.handle, rating: p.user.rating, played: 0, wins: 0, losses: 0, draws: 0 };
        s.rating = p.user.rating; // live rating is identical across the model's rows
        s.played++;
        if (draw) s.draws++;
        else if (p.placement === 1) s.wins++;
        else s.losses++;
        standings.set(p.user.handle, s);
      }
    }

    return {
      models: [...models.values()].sort((a, b) => b.played - a.played),
      champions: [...champions.values()]
        .filter((c) => c.wins > 0)
        .sort((a, b) => b.wins - a.wins || a.games - b.games)
        .slice(0, 100),
      aiVsAi: [...standings.values()].sort((a, b) => b.rating - a.rating || b.played - a.played),
    };
  });
}
