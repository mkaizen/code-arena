import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function problemRoutes(app: FastifyInstance) {
  // FR-23/FR-24: searchable archive with difficulty + tag filters.
  app.get("/problems", async (req) => {
    const q = req.query as { difficulty?: string; tag?: string };
    return prisma.problem.findMany({
      where: {
        difficulty: q.difficulty as never,
        tags: q.tag ? { has: q.tag } : undefined,
      },
      select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, tags: true },
      orderBy: { ratingValue: "asc" },
    });
  });

  app.get("/problems/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const p = await prisma.problem.findUnique({
      where: { slug },
      include: { samples: { orderBy: { ordinal: "asc" } } },
    });
    if (!p) return reply.code(404).send({ error: "not found" });
    return p; // hidden tests are never serialized to clients (FR-4)
  });
}
