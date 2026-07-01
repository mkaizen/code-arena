import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LANGUAGES } from "@arena/shared";
import { prisma } from "../db.js";
import { judgeQueue } from "../queue.js";

const submitBody = z.object({
  problemId: z.string(),
  contestId: z.string().optional(),
  matchId: z.string().optional(),
  language: z.enum(LANGUAGES as [string, ...string[]]),
  source: z.string().min(1).max(64_000),
});

export async function submissionRoutes(app: FastifyInstance) {
  // FR-10/NFR-4: accept submissions only within the contest window.
  app.post("/submissions", { onRequest: [app.authenticate] }, async (req, reply) => {
    const b = submitBody.parse(req.body);
    const userId = req.user.sub;

    let rated = false;
    if (b.contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: b.contestId },
        include: { problems: { where: { problemId: b.problemId } }, registrations: { where: { userId } } },
      });
      if (!contest) return reply.code(404).send({ error: "contest not found" });

      // Implemented (was TODO): contest-window validation, server clock authoritative.
      const now = Date.now();
      const start = contest.startsAt.getTime();
      const end = start + contest.durationSec * 1000;
      if (now < start) return reply.code(409).send({ error: "contest has not started" });
      if (now >= end) return reply.code(409).send({ error: "contest window has closed" });
      if (contest.problems.length === 0) return reply.code(400).send({ error: "problem not in this contest" });
      if (contest.registrations.length === 0) return reply.code(403).send({ error: "not registered for contest" });

      rated = contest.rated; // FR-25: only contest subs are rated; practice is not.
    } else if (b.matchId) {
      const match = await prisma.match.findUnique({
        where: { id: b.matchId },
        include: { players: { where: { userId } } },
      });
      if (!match) return reply.code(404).send({ error: "match not found" });
      if (match.status !== "ACTIVE") return reply.code(409).send({ error: "match has ended" });
      const me = match.players[0];
      if (!me) return reply.code(403).send({ error: "not a player in this match" });
      if (me.status !== "ALIVE") return reply.code(403).send({ error: "you have been eliminated" });

      const currentProblem = await prisma.matchProblem.findUnique({
        where: { matchId_round: { matchId: b.matchId, round: match.round } },
      });
      if (!currentProblem || currentProblem.problemId !== b.problemId) {
        return reply.code(400).send({ error: "not the current round's problem" });
      }
      // Battle Royale submissions never affect rating.
    }

    const submission = await prisma.submission.create({
      data: {
        userId,
        problemId: b.problemId,
        contestId: b.contestId,
        matchId: b.matchId,
        language: b.language,
        source: b.source,
        rated,
      },
    });

    await judgeQueue.add("judge", { submissionId: submission.id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return reply.code(202).send({ id: submission.id, verdict: submission.verdict });
  });

  // FR-18: full submission history.
  app.get("/submissions", { onRequest: [app.authenticate] }, async (req) => {
    return prisma.submission.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, problemId: true, contestId: true, language: true,
        verdict: true, failedCase: true, timeMs: true, memoryKb: true, createdAt: true,
      },
    });
  });
}
