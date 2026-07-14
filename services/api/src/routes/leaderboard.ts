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
      where: { isBot: false },
      orderBy: { rating: "desc" },
      take: 200,
      select: { handle: true, rating: true },
    });
  });
}
