import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getLeaderboard, isFrozen, ensureFreezeSnapshot } from "../leaderboard/freeze.js";

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
  app.get("/leaderboard/global", async () => {
    return prisma.user.findMany({
      where: { isBot: false, guest: false },
      orderBy: { rating: "desc" },
      take: 200,
      select: { handle: true, rating: true },
    });
  });

  // Humans-vs-AI scoreboard: each AI opponent's record against human players,
  // plus a hall of registered players who have beaten it. Aggregated from
  // finished "Challenge the AI" duels.
  app.get("/leaderboard/ai", async () => {
    const matches = await prisma.match.findMany({
      where: { aiDuel: true, status: "FINISHED" },
      orderBy: { endedAt: "desc" },
      take: 5000,
      select: {
        players: {
          select: { placement: true, user: { select: { isBot: true, guest: true, handle: true } } },
        },
      },
    });

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

    return {
      models: [...models.values()].sort((a, b) => b.played - a.played),
      champions: [...champions.values()]
        .filter((c) => c.wins > 0)
        .sort((a, b) => b.wins - a.wins || a.games - b.games)
        .slice(0, 100),
    };
  });
}
