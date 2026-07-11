import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../db.js";
import { s3 } from "../storage.js";
import { env } from "../env.js";
import { recomputeRatings } from "../rating/elo.js";
import { findSimilarPairs, type CodeDoc } from "../plagiarism/detect.js";
import type { PlagiarismProblemReport } from "@arena/shared";

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { role: true } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SETTER")) {
    return reply.code(403).send({ error: "forbidden" });
  }
}

/** Pack an array of {input, output} test cases into a tar buffer. */
async function packTests(tests: { input: string; output: string }[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "arena-tests-"));
  const tarPath = join(tmpdir(), `arena-tests-${Date.now()}.tar`);
  try {
    const files: string[] = [];
    for (let i = 0; i < tests.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      await writeFile(join(dir, `${n}.in`), tests[i].input);
      await writeFile(join(dir, `${n}.out`), tests[i].output);
      files.push(`${n}.in`, `${n}.out`);
    }
    await tar.create({ file: tarPath, cwd: dir }, files);
    return await readFile(tarPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(tarPath).catch(() => {});
  }
}

const problemBody = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(128),
  statement: z.string().min(1),
  editorial: z.string().max(40_000).optional(),
  difficulty: z.enum(["easy", "med", "hard"]),
  ratingValue: z.number().int().min(800).max(3500),
  tags: z.array(z.string()).default([]),
  timeMs: z.number().int().min(100).max(10_000).default(2000),
  memoryKb: z.number().int().min(16_384).max(524_288).default(262_144),
  samples: z.array(z.object({ input: z.string(), output: z.string() })).min(1),
  tests: z.array(z.object({ input: z.string(), output: z.string() })).min(1),
});

const problemUpdateBody = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(128),
  statement: z.string().min(1),
  editorial: z.string().max(40_000).optional(),
  difficulty: z.enum(["easy", "med", "hard"]),
  ratingValue: z.number().int().min(800).max(3500),
  tags: z.array(z.string()).default([]),
  timeMs: z.number().int().min(100).max(10_000),
  memoryKb: z.number().int().min(16_384).max(524_288),
  samples: z.array(z.object({ input: z.string(), output: z.string() })).min(1),
});

const contestBody = z.object({
  name: z.string().min(2).max(128),
  startsAt: z.string().datetime(),
  durationSec: z.number().int().min(1800).max(86_400),
  scoring: z.enum(["ICPC", "POINTS"]).default("ICPC"),
  rated: z.boolean().default(true),
  freezeSec: z.number().int().min(0).max(3600).default(1800),
  problems: z.array(z.object({
    problemId: z.string(),
    label: z.string().max(4),
    points: z.number().int().min(0).default(100),
  })).default([]),
});

export async function adminRoutes(app: FastifyInstance) {
  // ── Problems ────────────────────────────────────────────────────────────────

  app.post("/admin/problems", { onRequest: [requireAdmin] }, async (req, reply) => {
    const b = problemBody.parse(req.body);

    const tarBuf = await packTests(b.tests);
    const problem = await prisma.problem.create({
      data: {
        slug: b.slug,
        title: b.title,
        statement: b.statement,
        editorial: b.editorial ?? null,
        difficulty: b.difficulty as any,
        ratingValue: b.ratingValue,
        tags: b.tags,
        timeMs: b.timeMs,
        memoryKb: b.memoryKb,
        testsKey: `problems/placeholder/tests.tar`, // updated below
        testCount: b.tests.length,
        samples: {
          create: b.samples.map((s, i) => ({ input: s.input, output: s.output, ordinal: i })),
        },
      },
    });

    const testsKey = `problems/${problem.id}/tests.tar`;
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: testsKey,
      Body: tarBuf,
      ContentType: "application/x-tar",
    }));
    await prisma.problem.update({ where: { id: problem.id }, data: { testsKey } });

    return reply.code(201).send({ id: problem.id, slug: problem.slug });
  });

  // List all problems for the admin manage view.
  app.get("/admin/problems", { onRequest: [requireAdmin] }, async () => {
    return prisma.problem.findMany({
      orderBy: { ratingValue: "asc" },
      select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, testCount: true },
    });
  });

  // Fetch one problem for editing (metadata + statement + samples; hidden test
  // cases live in object storage and are never returned).
  app.get("/admin/problems/:id", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.problem.findUnique({
      where: { id },
      include: { samples: { orderBy: { ordinal: "asc" } } },
    });
    if (!p) return reply.code(404).send({ error: "not found" });
    return {
      id: p.id, slug: p.slug, title: p.title, statement: p.statement, editorial: p.editorial,
      difficulty: p.difficulty, ratingValue: p.ratingValue, tags: p.tags,
      timeMs: p.timeMs, memoryKb: p.memoryKb, testCount: p.testCount,
      samples: p.samples.map((s) => ({ input: s.input, output: s.output })),
    };
  });

  // Update metadata, statement, and samples. Hidden tests are replaced
  // separately via PUT /admin/problems/:id/tests (below).
  app.put("/admin/problems/:id", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = problemUpdateBody.parse(req.body);
    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "not found" });

    await prisma.$transaction([
      prisma.sample.deleteMany({ where: { problemId: id } }),
      prisma.problem.update({
        where: { id },
        data: {
          slug: b.slug,
          title: b.title,
          statement: b.statement,
          editorial: b.editorial ?? null,
          difficulty: b.difficulty as any,
          ratingValue: b.ratingValue,
          tags: b.tags,
          timeMs: b.timeMs,
          memoryKb: b.memoryKb,
          version: { increment: 1 }, // FR-7: bump on edit
          samples: { create: b.samples.map((s, i) => ({ input: s.input, output: s.output, ordinal: i })) },
        },
      }),
    ]);
    return { ok: true, slug: b.slug };
  });

  app.put("/admin/problems/:id/tests", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tests } = z.object({ tests: z.array(z.object({ input: z.string(), output: z.string() })).min(1) }).parse(req.body);

    const tarBuf = await packTests(tests);
    const testsKey = `problems/${id}/tests.tar`;
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: testsKey,
      Body: tarBuf,
      ContentType: "application/x-tar",
    }));
    await prisma.problem.update({ where: { id }, data: { testsKey, testCount: tests.length } });
    return { ok: true };
  });

  // ── Contests ─────────────────────────────────────────────────────────────────

  app.post("/admin/contests", { onRequest: [requireAdmin] }, async (req, reply) => {
    const b = contestBody.parse(req.body);
    const contest = await prisma.contest.create({
      data: {
        name: b.name,
        startsAt: new Date(b.startsAt),
        durationSec: b.durationSec,
        scoring: b.scoring as any,
        rated: b.rated,
        freezeSec: b.freezeSec,
        problems: {
          create: b.problems.map((p) => ({
            problemId: p.problemId,
            label: p.label,
            points: p.points,
          })),
        },
      },
    });
    return reply.code(201).send({ id: contest.id });
  });

  app.put("/admin/contests/:id/problems", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { problems } = z.object({
      problems: z.array(z.object({
        problemId: z.string(),
        label: z.string().max(4),
        points: z.number().int().min(0).default(100),
      })),
    }).parse(req.body);

    await prisma.contestProblem.deleteMany({ where: { contestId: id } });
    await prisma.contestProblem.createMany({
      data: problems.map((p) => ({ contestId: id, problemId: p.problemId, label: p.label, points: p.points })),
    });
    return { ok: true };
  });

  // ── Rating finalization ───────────────────────────────────────────────────────

  app.post("/admin/contests/:id/finalize", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) return reply.code(404).send({ error: "not found" });
    if (!contest.rated) return reply.code(409).send({ error: "contest is not rated" });

    const endMs = contest.startsAt.getTime() + contest.durationSec * 1000;
    if (Date.now() < endMs) return reply.code(409).send({ error: "contest has not ended yet" });

    const existing = await prisma.ratingChange.findFirst({ where: { contestId: id } });
    if (existing) return reply.code(409).send({ error: "ratings already finalized" });

    // Build final standings: rank by (solved DESC, penalty ASC)
    const userSubs = await prisma.submission.findMany({
      where: { contestId: id, verdict: "ACCEPTED", rated: true },
      orderBy: { createdAt: "asc" },
      select: { userId: true, problemId: true, createdAt: true },
    });
    const wrongCounts = await prisma.submission.groupBy({
      by: ["userId", "problemId"],
      where: { contestId: id, verdict: { not: "ACCEPTED" }, rated: true },
      _count: true,
    });
    const wrongMap = new Map(wrongCounts.map((r) => [`${r.userId}:${r.problemId}`, r._count as number]));

    const startMs = contest.startsAt.getTime();
    const perUser = new Map<string, { solved: number; penalty: number }>();
    const firstAC = new Map<string, number>(); // userId:problemId -> timestamp

    for (const s of userSubs) {
      const key = `${s.userId}:${s.problemId}`;
      if (firstAC.has(key)) continue;
      firstAC.set(key, s.createdAt.getTime());
      const u = perUser.get(s.userId) ?? { solved: 0, penalty: 0 };
      const tries = wrongMap.get(key) ?? 0;
      u.solved++;
      u.penalty += Math.floor((s.createdAt.getTime() - startMs) / 60_000) + tries * 20;
      perUser.set(s.userId, u);
    }

    const registrations = await prisma.registration.findMany({
      where: { contestId: id },
      include: { user: { select: { id: true, rating: true } } },
    });

    const standings = registrations
      .map((r) => ({
        userId: r.userId,
        rating: r.user.rating,
        ...(perUser.get(r.userId) ?? { solved: 0, penalty: 0 }),
      }))
      .sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);

    // Assign ranks (ties share the higher rank)
    let rank = 1;
    const participants = standings.map((s, i) => {
      if (i > 0 && (s.solved !== standings[i - 1].solved || s.penalty !== standings[i - 1].penalty)) rank = i + 1;
      return { userId: s.userId, rating: s.rating, rank };
    });

    const deltas = recomputeRatings(participants);

    await prisma.$transaction([
      ...deltas.map((d) =>
        prisma.ratingChange.create({
          data: { userId: d.userId, contestId: id, before: d.before, after: d.after, rank: participants.find((p) => p.userId === d.userId)!.rank },
        }),
      ),
      ...deltas.map((d) =>
        prisma.user.update({ where: { id: d.userId }, data: { rating: d.after } }),
      ),
    ]);

    return { finalized: deltas.length, changes: deltas };
  });

  // Plagiarism/duplicate-detection signals for a contest (NFR-4). For each
  // problem, compare one representative submission per user (their latest) and
  // surface structurally-similar pairs for a human to review. This is a signal,
  // not a verdict — nothing is actioned automatically.
  app.get("/admin/contests/:id/plagiarism", { onRequest: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { threshold } = req.query as { threshold?: string };
    const minScore = threshold ? Math.min(Math.max(Number(threshold), 0), 1) : undefined;

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: { problems: { include: { problem: { select: { id: true, slug: true, title: true } } } } },
    });
    if (!contest) return reply.code(404).send({ error: "not found" });

    const submissions = await prisma.submission.findMany({
      where: { contestId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, problemId: true, source: true, user: { select: { handle: true } } },
    });

    // Latest submission per (problem, user) is that user's representative.
    const repByProblem = new Map<string, Map<string, CodeDoc>>();
    for (const s of submissions) {
      let perUser = repByProblem.get(s.problemId);
      if (!perUser) { perUser = new Map(); repByProblem.set(s.problemId, perUser); }
      perUser.set(s.userId, { submissionId: s.id, userId: s.userId, handle: s.user.handle, source: s.source });
    }

    const reports: PlagiarismProblemReport[] = contest.problems.map((cp) => {
      const docs = [...(repByProblem.get(cp.problemId)?.values() ?? [])];
      return {
        problemId: cp.problem.id,
        slug: cp.problem.slug,
        title: cp.problem.title,
        submissionsCompared: docs.length,
        pairs: findSimilarPairs(docs, minScore !== undefined ? { threshold: minScore } : {}),
      };
    });

    return { contestId: id, name: contest.name, reports };
  });
}
