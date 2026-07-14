# Smoke test: Bot practice matches

A quick manual pass to confirm the bot practice feature works end-to-end on a
deploy. It can't be exercised in CI (needs Postgres + Redis + the judge), so run
this once after shipping it to production. ~5 minutes.

## Before you start (deploy)

1. **Apply the migration.** The API container runs `prisma migrate deploy` on
   start (see `services/api/Dockerfile`), so a normal redeploy/rebuild applies
   `20260713000000_bot_practice_matches` automatically. No manual step needed.

2. **Bots.** The 16 practice bots are provisioned **lazily on the first practice
   match** (`ensureBotsProvisioned` in `services/api/src/match/engine.ts`), so no
   manual step is required. You can still create them up front via the seed
   (idempotent) if you prefer:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile seed up seed
   ```

## Checklist

Logged in on the deployed site:

- [ ] **1. Launcher visible.** The Battle page shows the "🤖 Practice vs Bots"
      panel with **Practice Battle Royale** and **Practice 1v1 Duel** buttons.
- [ ] **2. Instant start.** Clicking **Practice Battle Royale** drops you
      straight into a match — no queue/waiting. The header shows a **PRACTICE**
      tag, and the players panel lists you plus 5 bots, each with a 🤖 badge and
      a rating near yours.
- [ ] **3. Bots behave like students.** Over a round, bots flip to **Solved ✓**
      at *different* times (not all at once). On a harder round, at least one
      bot should stay **Racing…** or fail to solve it.
- [ ] **4. Round transitions.** Solve the problem yourself → the round advances.
      Deliberately *don't* solve one → you're eliminated when the timer expires
      (Royale) / lose the round (Duel).
- [ ] **5. Unrated.** When the match finishes you get a placement, but **your
      rating does not change** (check your profile before/after).
- [ ] **6. No leakage.** Bots must not appear in:
      - [ ] the global leaderboard (`/leaderboard`),
      - [ ] a problem's "solved by N" count / acceptance %,
      - [ ] a problem's fastest-runtime or shortest-code boards.
- [ ] **7. Duel works.** **Practice 1v1 Duel** puts you against a single bot,
      best-of-3, and resolves to a winner.

If all seven pass, the feature is healthy.

## If something's off

- **"no practice bots are available"** → shouldn't happen now that bots
  self-provision, but if it does the deploy predates that fix — run the seed
  profile above, or redeploy.
- **Bots never solve / all solve instantly** → check the API logs for
  `bot action error`; the per-round scheduler arms `setTimeout`s, so a crash in
  `botSubmit` would surface there.
- **Bots showing on a leaderboard** → the `isBot` exclusion is in the query
  layer (`routes/problems.ts`, `routes/leaderboard.ts`); confirm the deploy
  includes those changes.
