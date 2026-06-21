import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function contestRoutes(app: FastifyInstance) {
  app.get("/contests", async () => {
    return prisma.contest.findMany({
      orderBy: { startsAt: "desc" },
      select: { id: true, name: true, startsAt: true, durationSec: true, scoring: true, rated: true },
    });
  });

  // FR-9: register for an upcoming contest.
  app.post("/contests/:id/register", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) return reply.code(404).send({ error: "not found" });
    if (Date.now() >= contest.startsAt.getTime() + contest.durationSec * 1000) {
      return reply.code(409).send({ error: "contest already ended" });
    }
    await prisma.registration.upsert({
      where: { contestId_userId: { contestId: id, userId: req.user.sub } },
      create: { contestId: id, userId: req.user.sub, remindAt: contest.startsAt },
      update: {},
    });
    return reply.send({ ok: true });
  });
}
