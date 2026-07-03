import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { MatchHistoryEntry, MatchMode, PublicProfile } from "@arena/shared";

export async function userRoutes(app: FastifyInstance) {
  // Public profile — rating, solve count, and match record/history for any user.
  // No auth required and never exposes source code or private data.
  app.get("/users/:handle", async (req, reply) => {
    const { handle } = req.params as { handle: string };

    const user = await prisma.user.findUnique({
      where: { handle },
      select: { id: true, handle: true, rating: true, createdAt: true },
    });
    if (!user) return reply.code(404).send({ error: "user not found" });

    const [acProblems, submissions, recent, placements] = await Promise.all([
      prisma.submission.findMany({
        where: { userId: user.id, verdict: "ACCEPTED" },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
      prisma.submission.count({ where: { userId: user.id } }),
      prisma.matchPlayer.findMany({
        where: { userId: user.id, match: { status: "FINISHED" } },
        orderBy: { match: { endedAt: "desc" } },
        take: 10,
        include: { match: { select: { id: true, mode: true, endedAt: true, _count: { select: { players: true } } } } },
      }),
      prisma.matchPlayer.findMany({
        where: { userId: user.id, match: { status: "FINISHED" } },
        select: { placement: true },
      }),
    ]);

    const wins = placements.filter((p) => p.placement === 1).length;
    const recentMatches: MatchHistoryEntry[] = recent.map((r) => ({
      matchId: r.match.id,
      mode: r.match.mode as MatchMode,
      placement: r.placement,
      playerCount: r.match._count.players,
      won: r.placement === 1,
      ratingBefore: r.ratingBefore,
      ratingAfter: r.ratingAfter,
      endedAt: r.match.endedAt?.toISOString() ?? null,
    }));

    const profile: PublicProfile = {
      handle: user.handle,
      rating: user.rating,
      joinedAt: user.createdAt.toISOString(),
      solved: acProblems.length,
      submissions,
      record: { wins, losses: placements.length - wins, played: placements.length },
      recentMatches,
    };
    return profile;
  });
}
