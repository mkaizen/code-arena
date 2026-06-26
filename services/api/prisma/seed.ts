/**
 * Seed script: creates an admin user, two solvable problems (with hidden test
 * bundles uploaded to object storage), and a live contest wiring them together.
 *
 * Run with infra up and env loaded:
 *   pnpm --filter @arena/api exec tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
import argon2 from "argon2";

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
});
const BUCKET = process.env.S3_BUCKET ?? "arena-testcases";

async function packAndUpload(key: string, tests: { input: string; output: string }[]): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "seed-tests-"));
  const tarPath = join(tmpdir(), `seed-${Date.now()}.tar`);
  try {
    const files: string[] = [];
    for (let i = 0; i < tests.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      await writeFile(join(dir, `${n}.in`), tests[i].input);
      await writeFile(join(dir, `${n}.out`), tests[i].output);
      files.push(`${n}.in`, `${n}.out`);
    }
    await tar.create({ file: tarPath, cwd: dir }, files);
    const body = await readFile(tarPath);
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "application/x-tar" }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(tarPath).catch(() => {});
  }
}

interface ProblemSeed {
  slug: string;
  title: string;
  statement: string;
  difficulty: "easy" | "med" | "hard";
  ratingValue: number;
  tags: string[];
  samples: { input: string; output: string }[];
  tests: { input: string; output: string }[];
}

const PROBLEMS: ProblemSeed[] = [
  {
    slug: "sum-of-two",
    title: "Sum of Two",
    statement:
      "<p>Read two space-separated integers <code>a</code> and <code>b</code> on a single line. " +
      "Print their sum.</p><p><strong>Constraints:</strong> -10<sup>9</sup> &le; a, b &le; 10<sup>9</sup></p>",
    difficulty: "easy",
    ratingValue: 800,
    tags: ["math", "implementation"],
    samples: [
      { input: "2 3\n", output: "5\n" },
      { input: "-4 10\n", output: "6\n" },
    ],
    tests: [
      { input: "2 3\n", output: "5\n" },
      { input: "-4 10\n", output: "6\n" },
      { input: "1000000000 1000000000\n", output: "2000000000\n" },
      { input: "0 0\n", output: "0\n" },
      { input: "-1000000000 -1000000000\n", output: "-2000000000\n" },
    ],
  },
  {
    slug: "hello-name",
    title: "Greeting",
    statement:
      "<p>Read a single line containing a name. Print <code>Hello, &lt;name&gt;!</code></p>" +
      "<p>For example, if the input is <code>World</code>, print <code>Hello, World!</code></p>",
    difficulty: "easy",
    ratingValue: 900,
    tags: ["strings", "implementation"],
    samples: [{ input: "World\n", output: "Hello, World!\n" }],
    tests: [
      { input: "World\n", output: "Hello, World!\n" },
      { input: "Arena\n", output: "Hello, Arena!\n" },
      { input: "Claude\n", output: "Hello, Claude!\n" },
    ],
  },
];

async function ensureBucket() {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`created bucket ${BUCKET}`);
  } catch (err: any) {
    if (err?.name === "BucketAlreadyOwnedByYou" || err?.name === "BucketAlreadyExists") return;
    console.warn(`bucket ensure: ${err?.name ?? err}`);
  }
}

async function main() {
  await ensureBucket();

  // ── Admin + demo users ────────────────────────────────────────────────────
  const passwordHash = await argon2.hash("password123");
  const admin = await prisma.user.upsert({
    where: { email: "admin@codearena.dev" },
    update: { role: "ADMIN" },
    create: { handle: "admin", email: "admin@codearena.dev", passwordHash, role: "ADMIN", rating: 2400 },
  });
  await prisma.user.upsert({
    where: { email: "demo@codearena.dev" },
    update: {},
    create: { handle: "demo", email: "demo@codearena.dev", passwordHash, rating: 1500 },
  });
  console.log(`admin user: admin@codearena.dev / password123`);

  // ── Problems ──────────────────────────────────────────────────────────────
  const problemIds: string[] = [];
  for (const p of PROBLEMS) {
    const existing = await prisma.problem.findUnique({ where: { slug: p.slug } });
    if (existing) {
      problemIds.push(existing.id);
      console.log(`problem ${p.slug} already exists, skipping`);
      continue;
    }
    const created = await prisma.problem.create({
      data: {
        slug: p.slug,
        title: p.title,
        statement: p.statement,
        difficulty: p.difficulty,
        ratingValue: p.ratingValue,
        tags: p.tags,
        timeMs: 2000,
        memoryKb: 262_144,
        testsKey: `problems/pending/${p.slug}.tar`,
        testCount: p.tests.length,
        samples: { create: p.samples.map((s, i) => ({ input: s.input, output: s.output, ordinal: i })) },
      },
    });
    const testsKey = `problems/${created.id}/tests.tar`;
    await packAndUpload(testsKey, p.tests);
    await prisma.problem.update({ where: { id: created.id }, data: { testsKey } });
    problemIds.push(created.id);
    console.log(`created problem ${p.slug} (${created.id}), tests -> ${testsKey}`);
  }

  // ── Live contest ──────────────────────────────────────────────────────────
  // Always reset start time so re-running seed gives a fresh live contest.
  const contestStart = new Date(Date.now() - 60_000); // 1 min ago → live immediately
  const existingContest = await prisma.contest.findFirst({ where: { name: "Code Arena Round 1" } });
  if (existingContest) {
    await prisma.contest.update({
      where: { id: existingContest.id },
      data: { startsAt: contestStart, durationSec: 24 * 60 * 60 },
    });
    console.log(`reset "Code Arena Round 1" start time → live for 24h`);
  } else {
    const contest = await prisma.contest.create({
      data: {
        name: "Code Arena Round 1",
        startsAt: contestStart,
        durationSec: 24 * 60 * 60, // 24h so it stays live after a fresh deploy
        scoring: "ICPC",
        rated: true,
        freezeSec: 1800,
        problems: {
          create: problemIds.map((problemId, i) => ({
            problemId,
            label: String.fromCharCode(65 + i),
            points: 100,
          })),
        },
      },
    });
    console.log(`created live contest "Code Arena Round 1" (${contest.id})`);
  }

  console.log("seed complete ✓");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
