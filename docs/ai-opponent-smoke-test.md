# Smoke test: Challenge the AI (M1 backend)

The AI-opponent path (model → real code → judge → verdict → retry) needs a model
API key, Redis, and the judge, so it can't run in CI. Run this once after
deploying with the feature configured. ~5 minutes.

## Before you start (deploy)

1. **Apply the migration.** The API container runs `prisma migrate deploy` on
   start, so a normal redeploy applies `20260718000000_ai_opponent`
   (adds `User.botModel`, `Match.aiDuel`, `Match.aiDifficulty`). No manual step.

2. **Configure the model.** Set on the API service:
   - `AI_API_KEY` — the provider key.
   - `AI_OPPONENT_MODEL` — the wire model id to play as.
   - `AI_OPPONENT_NAME` — display name in the match UI (defaults to `Arena AI`).
   - Optionally `AI_API_URL` / `AI_API_VERSION` for a non-default endpoint.

   Without `AI_API_KEY` **and** `AI_OPPONENT_MODEL` the feature is disabled:
   `GET /matches/ai/config` returns `{ enabled: false }` and `POST /matches/ai`
   returns 404. The rest of the app is unaffected.

## Steps

1. **Feature flag.** `GET /matches/ai/config` → `{ enabled: true, opponent: "<name>" }`.

2. **Start a duel.** As a logged-in user, `POST /matches/ai { "difficulty": "med" }`
   → `{ matchId }`. Open the match; you should see one opponent whose handle is the
   configured name, and a normal DUEL (best-of-3) board.

3. **Watch the AI actually play.** After the think-time pause (medium ≈ 20s), the
   opponent's submission appears in the live feed with a real verdict. Confirm in
   the DB that its `Submission.source` is real code (not `// practice bot`) and
   `Submission.language` is a supported language.

4. **Iteration.** If its first attempt is `WRONG_ANSWER`/`TLE`, it should submit
   again (medium allows up to 2 retries) until it solves or the budget is spent.
   Verify multiple `Submission` rows for the opponent within one round.

5. **Fairness knob.** Start a `"hard"` duel — it should start faster (no think
   floor) and retry more; an `"easy"` duel pauses longer and never retries.

6. **Rating integrity.** After the match, confirm the human's `User.rating` is
   unchanged (AI duels are unrated) and the match row has `aiDuel = true`.

7. **Rate limit.** Fire `POST /matches/ai` more than 10 times within an hour from
   one IP → the 11th returns 429.

## Notes

- If the model returns no parseable program, the opponent simply sits the attempt
  out (no crash) — you may see it concede a round. Check API logs for
  `ai opponent` errors if that happens repeatedly.
- Anonymous (no-login) duels and the frontend "Challenge the AI" button land in
  the next M1 slice; this test drives the backend directly.
