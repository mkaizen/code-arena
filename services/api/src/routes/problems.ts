import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

interface StatRow { problemId: string; total: bigint; accepted: bigint; solvers: bigint }

/** Per-problem stats: distinct solvers and submission acceptance rate. */
function toStats(r?: StatRow): { solved: number; acceptance: number | null } {
  if (!r) return { solved: 0, acceptance: null };
  const total = Number(r.total);
  const accepted = Number(r.accepted);
  return { solved: Number(r.solvers), acceptance: total > 0 ? Math.round((100 * accepted) / total) : null };
}

async function allProblemStats(): Promise<Map<string, { solved: number; acceptance: number | null }>> {
  const rows = await prisma.$queryRaw<StatRow[]>`
    SELECT "problemId",
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE verdict = 'ACCEPTED') AS accepted,
      COUNT(DISTINCT "userId") FILTER (WHERE verdict = 'ACCEPTED') AS solvers
    FROM "Submission"
    GROUP BY "problemId"`;
  return new Map(rows.map((r) => [r.problemId, toStats(r)]));
}

async function oneProblemStats(id: string): Promise<{ solved: number; acceptance: number | null }> {
  const rows = await prisma.$queryRaw<StatRow[]>`
    SELECT "problemId",
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE verdict = 'ACCEPTED') AS accepted,
      COUNT(DISTINCT "userId") FILTER (WHERE verdict = 'ACCEPTED') AS solvers
    FROM "Submission"
    WHERE "problemId" = ${id}
    GROUP BY "problemId"`;
  return toStats(rows[0]);
}

export async function problemRoutes(app: FastifyInstance) {
  // FR-23/FR-24: searchable archive with difficulty + tag filters, plus solve stats.
  app.get("/problems", async (req) => {
    const q = req.query as { difficulty?: string; tag?: string };
    const [problems, stats] = await Promise.all([
      prisma.problem.findMany({
        where: {
          difficulty: q.difficulty as never,
          tags: q.tag ? { has: q.tag } : undefined,
        },
        select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, tags: true },
        orderBy: { ratingValue: "asc" },
      }),
      allProblemStats(),
    ]);
    return problems.map((p) => ({ ...p, ...(stats.get(p.id) ?? { solved: 0, acceptance: null }) }));
  });

  app.get("/problems/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const p = await prisma.problem.findUnique({
      where: { slug },
      include: { samples: { orderBy: { ordinal: "asc" } } },
    });
    if (!p) return reply.code(404).send({ error: "not found" });
    const stats = await oneProblemStats(p.id);
    return { ...p, ...stats }; // hidden tests are never serialized to clients (FR-4)
  });
}
