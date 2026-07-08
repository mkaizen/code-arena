import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import type { GhostEvent, GhostView } from "@arena/shared";

const RACE_TTL_SEC = 2 * 60 * 60;
const raceKey = (id: string) => `ghost:race:${id}`;

interface RaceRecord {
  userId: string;
  problemId: string;
  startedAt: number;
  ghost: GhostView | null;
}

const startBody = z.object({ problemId: z.string() });
const finishBody = z.object({
  raceId: z.string(),
  events: z.array(z.object({ offsetMs: z.number().int().nonnegative(), verdict: z.string().max(40) })).max(50).default([]),
});

/** Picks a ghost to race: a random past run by someone else, biased toward the
 *  faster half so the target is challenging but usually beatable. */
async function pickGhost(problemId: string, excludeUserId: string): Promise<GhostView | null> {
  const runs = await prisma.ghostRun.findMany({
    where: { problemId, userId: { not: excludeUserId } },
    orderBy: { totalMs: "asc" },
    take: 20,
    include: { user: { select: { handle: true } } },
  });
  if (runs.length === 0) return null;
  const pool = runs.slice(0, Math.max(1, Math.ceil(runs.length / 2)));
  const r = pool[Math.floor(Math.random() * pool.length)];
  return { handle: r.user.handle, totalMs: r.totalMs, events: (r.events as unknown as GhostEvent[]) ?? [] };
}

export async function ghostRoutes(app: FastifyInstance) {
  // Begin a timed run. Server stamps the start (in Redis) so the finish time
  // can't be fabricated, and hands back a ghost to race (or null to set the pace).
  app.post("/ghost/start", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { problemId } = startBody.parse(req.body);
    const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { id: true } });
    if (!problem) return reply.code(404).send({ error: "problem not found" });

    const ghost = await pickGhost(problemId, req.user.sub);
    const raceId = randomUUID();
    const record: RaceRecord = { userId: req.user.sub, problemId, startedAt: Date.now(), ghost };
    await redis.set(raceKey(raceId), JSON.stringify(record), "EX", RACE_TTL_SEC);
    return { raceId, ghost };
  });

  // Finish a timed run. Recorded only if the user actually has an accepted
  // solution for the problem since the race began — that's what makes it a
  // legitimate ghost. Time is server-measured; the client's events are flavour.
  app.post("/ghost/finish", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { raceId, events } = finishBody.parse(req.body);
    const raw = await redis.get(raceKey(raceId));
    if (!raw) return reply.code(410).send({ error: "race expired or not found" });
    const race = JSON.parse(raw) as RaceRecord;
    if (race.userId !== req.user.sub) return reply.code(403).send({ error: "not your race" });

    const startedAt = new Date(race.startedAt);
    const solved = await prisma.submission.findFirst({
      where: { userId: req.user.sub, problemId: race.problemId, verdict: "ACCEPTED", createdAt: { gte: startedAt } },
      select: { id: true },
    });
    if (!solved) return reply.code(400).send({ error: "no accepted solution for this race yet" });

    const totalMs = Date.now() - race.startedAt;
    await redis.del(raceKey(raceId)); // one-shot
    await prisma.ghostRun.create({
      data: { problemId: race.problemId, userId: req.user.sub, totalMs, events },
    });

    const beat = race.ghost ? totalMs < race.ghost.totalMs : null;
    return { totalMs, ghost: race.ghost, beat };
  });
}
