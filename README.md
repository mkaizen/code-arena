# Code Arena

A competitive coding platform — sandboxed automated judging, live leaderboards, and a rating system, wrapped in several ways to compete. Built for individual developers and students.

Ways to play:

- **Contests** — timed rounds with a live, freezable ICPC-style leaderboard.
- **Battle** — live matchmade matches: **Duel** (1v1, best-of-3) and **Royale** (6-player elimination ladder), with replays and shareable result cards.
- **Daily** — a featured problem each day with solve streaks and a calendar.
- **Race** — time-attack against a "ghost": a recorded past run by another user, server-timed so the clock can't be faked.
- **Practice** — the full problem bank, plus a global all-time leaderboard and an engineering blog.

> Full requirements live in [`docs/Code_Arena_Project_Document.docx`](docs/Code_Arena_Project_Document.docx). An interactive front-end prototype of the contest loop is at [`docs/prototype.html`](docs/prototype.html).

## Architecture

```
apps/web        React + Vite + Monaco editor — contest/battle/daily/race UI, wired to API + WS
services/api     Fastify + Prisma + BullMQ producer + Redis leaderboard + live match engine
                 + email notifications, WS fan-out over a Redis bus
services/judge   BullMQ worker — Docker sandbox, per-language recipes, S3 test reads
packages/shared  @arena/shared — verdicts, domain types, match/ghost views, rating-tier colors
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

## Production deploy (single VPS + your domain)

`docker-compose.prod.yml` runs the whole stack behind Caddy, which terminates
TLS (automatic Let's Encrypt) and serves the SPA + reverse-proxies `/api/*` and
the `/api/ws` WebSocket to the API. The judge drives the **host** Docker daemon
via a mounted socket to launch sandbox containers.

**Prerequisites:** a VPS with Docker + Compose, your domain's A record pointed
at it, and ports 80/443 open.

```bash
git clone <your-fork> code-arena && cd code-arena

cp .env.prod.example .env.prod          # set DOMAIN, ACME_EMAIL, and secrets
mkdir -p /var/arena/work                # shared sandbox scratch dir

./scripts/build-sandboxes.sh            # build per-language sandbox images on the host

docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# seed an admin user + demo problems + a live contest (one-shot):
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile seed up seed
```

The API applies pending migrations on boot, so the schema is created
automatically on first start. Your site is then live at `https://$DOMAIN`.

A few notes:

- **Secrets** — generate strong values (`openssl rand -hex 32`) for
  `JWT_SECRET`, `POSTGRES_PASSWORD`, and the MinIO keys. `.env.prod` is
  gitignored; never commit it.
- **Scaling judging** — raise `JUDGE_CONCURRENCY`, or run more judge replicas
  (`docker compose ... up -d --scale judge=3`).
- **OAuth** — set the provider callback to
  `https://$DOMAIN/auth/callback/<provider>` and fill the client id/secret in
  `.env.prod` (leave blank to disable social login).

## Requirement traceability

Code is annotated with the `FR-`/`NFR-` IDs it implements. Highlights:

- **FR-1** email/password + GitHub/Google OAuth — `services/api/src/routes/auth.ts`
- **FR-10 / NFR-4** contest-window validation, server clock authoritative — `routes/submissions.ts`
- **FR-12 / FR-19** live leaderboard + freeze enforcement — `leaderboard/freeze.ts`
- **FR-14 / NFR-3** sandboxed execution — `services/judge/src/sandbox.ts`
- **FR-15** standard verdicts + failing-case indicator — `packages/shared/src/verdicts.ts`
- **FR-19** live real-time delivery, multi-node fan-out over Redis — `services/api/src/ws.ts`
- **FR-21 / NFR-6** deterministic rating recompute — `rating/elo.ts`
- **FR-26** email reminders + streak nudges, one-click unsubscribe — `mail/notifications.ts`

## Status

The MVP is built end-to-end — auth, judging, all four play modes, admin
tooling, notifications, and multi-node real-time delivery are in place.

**Done:**

- [x] Auth — email/password (Argon2id) + GitHub/Google OAuth, with the
      `/auth/callback/:provider` page in the web app
- [x] Judging — sandboxed execution, object-storage reads for hidden test
      bundles, standard verdicts + failing-case indicator
- [x] cgroup-based peak-memory accounting in the sandbox (cgroup v2
      `memory.peak`, with v1 fallback) — `services/judge/src/sandbox.ts`
- [x] Contests — window validation on submit, live leaderboard, freeze
      snapshot at the freeze window
- [x] Rating — deterministic Codeforces-style seed/Elo recompute +
      post-contest finalization
- [x] Battle — live matchmade Duel (1v1 bo3) and Royale (6-player
      elimination) with replays and shareable result cards
- [x] Daily challenge with solve streaks, and Race (time-attack vs. a
      recorded ghost run)
- [x] Admin setter UI for the problem bank and contests
- [x] Seed script — admin user, demo problems, and a live contest
- [x] Judge→API verdict push via Redis pub/sub (live verdict + leaderboard)
- [x] Notification delivery — email contest reminders and streak nudges,
      with one-click unsubscribe (`mail/notifications.ts`)
- [x] Multi-node WebSocket fan-out — every outbound event routes through a
      Redis `arena:ws` bus so each replica delivers to its own sockets
      (`services/api/src/ws.ts`)

**Still open:**

- [ ] Plagiarism / duplicate-detection signals (NFR-4)
- [ ] Problem-bank versioning history in the setter UI (FR-7)

## License

MIT — see [`LICENSE`](LICENSE).
