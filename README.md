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
pnpm db:deploy                  # apply migrations (prod-safe; use db:migrate in dev)
pnpm db:generate                # prisma client
pnpm db:seed                    # admin user + demo problems + a live contest

# build the sandbox images (one per language you support)
docker build -f services/judge/Dockerfile.sandbox --target cpp  -t arena-sandbox:cpp  services/judge
docker build -f services/judge/Dockerfile.sandbox --target py   -t arena-sandbox:py   services/judge
# ...repeat for java/node/go/rust as needed

pnpm dev                        # api + judge + web in parallel
```

API on `:8080`, web on `:5173`, MinIO console on `:9001`.

The seed creates an admin login (`admin@codearena.dev` / `password123`), two
solvable problems with hidden test bundles uploaded to object storage, and a
live **Code Arena Round 1** contest wiring them together — enough to log in,
open the arena, and submit end-to-end. `db:deploy` applies the committed
migration in `services/api/prisma/migrations`; use `db:migrate` when changing
the schema during development.

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

- [x] Seed script for an admin user, demo problems, and a live contest
- [x] Admin routes for problems/contests + post-contest rating finalization
- [x] Judge→API verdict push via Redis pub/sub (live verdict + leaderboard)
- [ ] cgroup-based memory accounting in the sandbox (currently time/exit-code based)
- [ ] Multi-node WebSocket fan-out (single-process pub/sub today)
- [ ] A setter UI for the problem bank (FR-7 versioning) — API exists, no UI yet
- [ ] OAuth callback page in the web app (`/auth/callback/:provider`)
- [ ] Notification delivery (email/in-app reminders, FR-26)
- [ ] Plagiarism/duplicate-detection signals (NFR-4)

## License

MIT — see [`LICENSE`](LICENSE).
