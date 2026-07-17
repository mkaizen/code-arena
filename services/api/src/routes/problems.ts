import type { FastifyInstance } from "fastify";
import type { Language, SpeedRow, BrevityRow } from "@arena/shared";
import { relatedProblems } from "@arena/shared";
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
    WHERE "userId" NOT IN (SELECT id FROM "User" WHERE "isBot")
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
    WHERE "problemId" = ${id} AND "userId" NOT IN (SELECT id FROM "User" WHERE "isBot")
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

  // Problems that share tags with this one — powers the "Related problems"
  // section (internal linking + keeping solvers in the bank).
  app.get("/problems/:slug/related", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const all = await prisma.problem.findMany({
      select: { slug: true, title: true, difficulty: true, ratingValue: true, tags: true },
    });
    const target = all.find((p) => p.slug === slug);
    if (!target) return reply.code(404).send({ error: "not found" });
    return relatedProblems(target, all, 6);
  });

  // Per-problem speed (fastest runtime) & brevity (shortest source) boards.
  // Best submission per user so one person can't fill the board; source code is
  // never exposed — only the metric, handle, and language.
  app.get("/problems/:slug/leaderboard", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const problem = await prisma.problem.findUnique({ where: { slug }, select: { id: true } });
    if (!problem) return reply.code(404).send({ error: "not found" });

    const [fastest, shortest] = await Promise.all([
      prisma.$queryRaw<{ handle: string; timeMs: number; language: string }[]>`
        SELECT u.handle, s."timeMs", s.language
        FROM (
          SELECT DISTINCT ON ("userId") "userId", "timeMs", language
          FROM "Submission"
          WHERE "problemId" = ${problem.id} AND verdict = 'ACCEPTED' AND "timeMs" IS NOT NULL
            AND "userId" NOT IN (SELECT id FROM "User" WHERE "isBot")
          ORDER BY "userId", "timeMs" ASC
        ) s JOIN "User" u ON u.id = s."userId"
        ORDER BY s."timeMs" ASC
        LIMIT 20`,
      prisma.$queryRaw<{ handle: string; chars: number; language: string }[]>`
        SELECT u.handle, s.chars, s.language
        FROM (
          SELECT DISTINCT ON ("userId") "userId", char_length(source) AS chars, language
          FROM "Submission"
          WHERE "problemId" = ${problem.id} AND verdict = 'ACCEPTED'
            AND "userId" NOT IN (SELECT id FROM "User" WHERE "isBot")
          ORDER BY "userId", char_length(source) ASC
        ) s JOIN "User" u ON u.id = s."userId"
        ORDER BY s.chars ASC
        LIMIT 20`,
    ]);

    return {
      fastest: fastest.map((r): SpeedRow => ({ handle: r.handle, timeMs: Number(r.timeMs), language: r.language as Language })),
      shortest: shortest.map((r): BrevityRow => ({ handle: r.handle, chars: Number(r.chars), language: r.language as Language })),
    };
  });
}
