# Code Arena

A competitive coding contest platform — timed contests, sandboxed automated judging, live leaderboards, and a rating system. Built for individual developers and students.

> Full requirements live in [`docs/Code_Arena_Project_Document.docx`](docs/Code_Arena_Project_Document.docx). An interactive front-end prototype of the contest loop is at [`docs/prototype.html`](docs/prototype.html).

## Architecture

```
apps/web        React + Vite + Monaco editor — contest UI, wired to API + WS
services/api     Fastify + Prisma + BullMQ producer + Redis leaderboard + WS push
services/judge   BullMQ worker — Docker sandbox, per-language recipes, S3 test reads
packages/shared  @arena/shared — verdicts, domain types, rating-tier colors
```

| Concern | Tech |
| --- | --- |
| System of record | PostgreSQL (Prisma ORM) |
| Submission queue + live leaderboard | Redis (BullMQ + sorted sets) |
| Hidden test-case storage | MinIO / S3 |
| Sandbox | Docker, per-language images, `--network=none`, capped CPU/mem/pids |
| Monorepo | pnpm workspaces + Turborepo |

The submission **queue decouples the contest-start spike** from the worker pool, so the
system degrades gracefully under load (NFR-2 / NFR-5). Scale judging by running more
`@arena/judge` workers.

## Quick start

```bash
pnpm install
cp .env.example .env            # fill OAuth secrets if you want social login

pnpm infra:up                   # postgres + redis + minio (+ bucket)
pnpm db:migrate                 # create schema
pnpm db:generate                # prisma client

# build the sandbox images (one per language you support)
docker build -f services/judge/Dockerfile.sandbox --target cpp  -t arena-sandbox:cpp  services/judge
docker build -f services/judge/Dockerfile.sandbox --target py   -t arena-sandbox:py   services/judge
# ...repeat for java/node/go/rust as needed

pnpm dev                        # api + judge + web in parallel
```

API on `:8080`, web on `:5173`, MinIO console on `:9001`.

## Requirement traceability

Code is annotated with the `FR-`/`NFR-` IDs it implements. Highlights:

- **FR-1** email/password + GitHub/Google OAuth — `services/api/src/routes/auth.ts`
- **FR-10 / NFR-4** contest-window validation, server clock authoritative — `routes/submissions.ts`
- **FR-12 / FR-19** live leaderboard + freeze enforcement — `leaderboard/freeze.ts`
- **FR-14 / NFR-3** sandboxed execution — `services/judge/src/sandbox.ts`
- **FR-15** standard verdicts + failing-case indicator — `packages/shared/src/verdicts.ts`
- **FR-21 / NFR-6** deterministic rating recompute — `rating/elo.ts`

## Status: open work picked up this round

All five scaffold TODOs are now implemented:

- [x] Password hashing (Argon2id) and OAuth authorization-code exchange
- [x] Object-storage reads for hidden test-case bundles
- [x] Leaderboard freeze enforcement (snapshot at freeze window)
- [x] Rating recompute algorithm (Codeforces-style seed/Elo)
- [x] Contest-window validation on submit

Still open before MVP:

- [ ] cgroup-based memory accounting in the sandbox (currently time/exit-code based)
- [ ] Redis pub/sub fan-out for multi-node WebSocket push
- [ ] Seed script + a setter UI for the problem bank (FR-7 versioning)
- [ ] Notification delivery (email/in-app reminders, FR-26)
- [ ] Plagiarism/duplicate-detection signals (NFR-4)

## License

MIT — see [`LICENSE`](LICENSE).
