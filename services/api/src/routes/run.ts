import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LANGUAGES } from "@arena/shared";
import type { RunResult } from "@arena/shared";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import { runQueue } from "../queue.js";

const runBody = z.object({
  problemId: z.string(),
  language: z.enum(LANGUAGES as [string, ...string[]]),
  source: z.string().min(1).max(64_000),
  // Optional: run once against this instead of the problem's samples.
  customInput: z.string().max(64_000).optional(),
});

export async function runRoutes(app: FastifyInstance) {
  // Test a solution against public samples (or custom input) without submitting.
  // Auth is OPTIONAL — guests can run to experience the product before signing
  // up (the onboarding "aha"). Logged-in clients get results pushed over the WS;
  // anonymous clients poll GET /run/:runId (below). Rate-limited per IP either way.
  app.post(
    "/run",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = runBody.parse(req.body);

      // Best-effort identify the caller; absence just means "anonymous run".
      let userId: string | undefined;
      try {
        await req.jwtVerify();
        userId = req.user.sub;
      } catch {
        userId = undefined;
      }

      const problem = await prisma.problem.findUnique({ where: { id: b.problemId }, select: { id: true } });
      if (!problem) return reply.code(404).send({ error: "problem not found" });

      const runId = randomUUID();
      await runQueue.add(
        "run",
        { runId, userId, problemId: b.problemId, language: b.language, source: b.source, customInput: b.customInput },
        { removeOnComplete: 200, removeOnFail: 200 },
      );
      return reply.code(202).send({ runId });
    },
  );

  // Public poll for a run's result — how anonymous (logged-out) clients get
  // their output, since they have no authenticated WebSocket. Returns
  // { result: null } until the judge has finished, then the RunResult.
  app.get("/run/:runId", async (req) => {
    const { runId } = req.params as { runId: string };
    const raw = await redis.get(`run:result:${runId}`);
    return { result: raw ? (JSON.parse(raw) as RunResult) : null };
  });
}
