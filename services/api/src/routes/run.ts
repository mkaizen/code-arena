import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LANGUAGES } from "@arena/shared";
import { prisma } from "../db.js";
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
  // Rate-limited like submissions; results stream back over the WS.
  app.post(
    "/run",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = runBody.parse(req.body);

      const problem = await prisma.problem.findUnique({ where: { id: b.problemId }, select: { id: true } });
      if (!problem) return reply.code(404).send({ error: "problem not found" });

      const runId = randomUUID();
      await runQueue.add(
        "run",
        { runId, userId: req.user.sub, problemId: b.problemId, language: b.language, source: b.source, customInput: b.customInput },
        { removeOnComplete: 200, removeOnFail: 200 },
      );
      return reply.code(202).send({ runId });
    },
  );
}
