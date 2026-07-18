# Design: Human vs. AI live coding battles

**Status:** proposed
**Owner:** TBD
**Goal:** Let a human play a live coding duel against an LLM opponent that
writes *real* code, runs it through the *real* judge, and *earns* its verdict on
the same hidden tests — then package that into a launch that earns attention
(Show HN: "Can you out-code Claude in a 5-minute duel?").

---

## 1. Why this is different from today's bots

The practice bots in `services/api/src/match/bots.ts` are **pure statistical
simulations**. `botRoundPlan()` decides *whether* and *when* a bot "solves" from
a rating curve, and `botSubmit()` (`services/api/src/match/engine.ts`) writes a
fake submission — literally `source: "// practice bot"` — with a pre-decided
verdict. Bots never write code and never touch the judge.

An AI opponent inverts that. It is given the same statement a human sees, it
writes a complete program, that program is compiled and run in the **same Docker
sandbox judge** (`services/judge`) against the **same hidden tests**, and the
verdict is whatever the judge returns. Nothing is scripted.

That authenticity *is* the launch story. "Can you beat Claude?" is only
credible — and only survives HN scrutiny — because the AI plays by exactly the
human's rules: same statement, same judge, same clock. The work below exists to
make that claim true and to make it demoable in one click.

---

## 2. Product shape (v1)

- **Entry point:** a "Challenge the AI" button on the landing page and the
  match screen. Starts a **DUEL** against a single AI opponent.
- **Anonymous, no login.** The frictionless "try it now" moment is the biggest
  launch multiplier, so a first-time visitor can start an AI duel with zero
  signup. Guarded by per-IP daily caps (see §6).
- **The opponent is visibly an AI:** it renders with the model's name and a
  distinct avatar (e.g. `Claude Opus 4.8`), not a random student handle.
- **Unrated for the human ladder.** An AI duel never moves the human's Elo
  (same as practice today). AI results feed a *separate* per-model leaderboard.
- **Shareable outcome:** the result screen produces an OG card —
  *"I beat Claude Opus on Two-Sum in 47s"* / *"Claude solved it 3× faster."*

---

## 3. Architecture

### 3.1 The AI submitter (the core new work)

New module `services/api/src/ai/opponent.ts`:

- Input: a problem view (statement HTML, samples, I/O format, target language).
- Calls the configured model, extracts a single complete stdin→stdout program
  from the response, and returns `{ language, source }` in a judge-supported
  language (recipes already exist in `services/judge/src/recipes.ts` for
  `cpp`/`py`/`java`/`go`/`rs`/`js`).
- Deterministic-ish extraction: take the last fenced code block; reject
  responses with no compilable block and retry once.

New engine path parallel to the bot scheduler, in
`services/api/src/match/engine.ts`:

- `runAiOpponentForRound(matchId, round)`: loads the round's problem, asks
  `opponent.ts` for code, then **submits that real code through the existing
  `judgeQueue`** — the same path a human uses
  (`services/api/src/routes/submissions.ts:98`). It does *not* fabricate a
  verdict.
- When the judge resolves the AI's submission, the existing completion hook
  calls `recordMatchSubmission` + `onAccepted` — identical to a human solve, so
  round advancement, elimination, and duel-winner logic are all reused
  unchanged.
- **Iteration loop:** on `WRONG_ANSWER` / `TLE` / compile error, feed the failing
  sample (and the compile log) back to the model and let it try again, bounded by
  the effort budget (§5). This is what makes AI solve *times* realistic instead
  of instantaneous, and it mirrors how a human iterates.

### 3.2 What we reuse unchanged

- **The judge.** The AI's code is just more untrusted code in a sandbox that
  already runs untrusted human code — **no new security surface** and no judge
  changes.
- **Match engine, WS fan-out, spectating, reactions, result/rating flow.**
  The AI is a `MatchPlayer` like any other; its submissions persist real
  `source`, so replays and "see how the AI solved it" fall out for free.

### 3.3 Data model

- Reuse `User.isBot`. Add an optional `botModel` tag (a column, or a reserved
  handle convention such as `Claude-Opus-4.8`) to distinguish AI players from the
  16 practice bots and from each other.
- AI submissions already carry real `source` and `verdict` — enough to power a
  per-model leaderboard and a solution-replay view with no schema churn beyond
  the tag.

### 3.4 Config

Add to `services/api/src/env.ts`, following the **optional** pattern of
`RESEND_API_KEY` (feature degrades off cleanly when unset, so the app still runs
anywhere):

- `ANTHROPIC_API_KEY` (optional) — enables the Claude opponent.
- `GEMINI_API_KEY` / `OPENAI_API_KEY` (optional) — enable additional models and
  turn the leaderboard from single-model into a multi-model comparison, which is
  the stronger hook.

If no model key is set, the "Challenge the AI" entry point is hidden and the
endpoints 404 — exactly how email behaves without a provider today.

---

## 4. Multi-model

v1 ships with **Claude Opus 4.8** wired in (it's the house model). The
`opponent.ts` interface is model-agnostic: a small adapter per provider
(`anthropic`, `gemini`, `openai`) behind one `generateSolution(problem, effort)`
signature. Adding a provider is a new adapter + an env key — no engine changes.

A **multi-model** roster is a materially better launch: the leaderboard becomes
"which model actually wins head-to-head on live coding duels," which is its own
discussion-bait and its own evergreen SEO page.

---

## 5. The fairness knob = an effort dial

Rather than injecting an artificial delay, the opponent's difficulty is set by
**how much effort the model is allowed to spend** — a single `effort` parameter
that shapes a believable, tunable opponent:

| Knob | Easier opponent | Harder opponent |
|---|---|---|
| Reasoning / thinking budget | low | high |
| Retry budget on wrong/TLE | 0–1 | several |
| Think-time floor before first submit | short | (none — as fast as it is) |
| Language | forced to a slower/verbose target | model's choice |

This gives us one dial from "beatable warm-up" to "you will lose," exposed as a
difficulty selector on the challenge screen. It also means the *same* mechanism
that makes the AI fair also makes AI-vs-AI matches interesting (pit low-effort
vs high-effort of the same model).

Whatever the setting, the launch writeup states it plainly: the AI gets the same
statement, the same judge, and the same clock — the effort dial only changes how
hard it tries, never what it can see.

---

## 6. Guardrails

- **Per-IP hourly cap: 10 AI submissions/hour** (Redis sliding-window counter,
  same infra as the existing per-IP submission rate limit). The metered event is a
  human submission in an AI duel — i.e. each time the human hands the AI a turn to
  respond to — which is what drives model spend. The AI's own iteration retries
  (§5) are bounded separately by the effort budget, so a single duel has a known
  worst-case cost regardless of the cap. Ten/hour keeps the "try it now" moment
  open without turning the API key into a faucet.
- **Bounded model spend per match:** the effort budget caps tokens and retries,
  so a single duel has a known worst-case cost.
- **Latency:** model call + compile can take seconds; it all runs async off the
  request and the verdict streams to the client over the existing WS channel —
  the human never blocks on it.
- **Abuse / injection:** problem statements are authored by us, so there's no
  untrusted text steering the model; and the sandbox is already the threat model
  for human code, so the AI's code adds nothing new.
- **Rating integrity:** AI duels are unrated for the human ladder, so there's
  nothing to farm.

---

## 7. Launch assets (what actually earns the spike)

1. **Instant, no-login AI duel** via shareable link — the frictionless demo.
2. **Two Elo leaderboard pages**, prerendered into the existing SEO pipeline
   (`apps/web/prerender.mjs`) — evergreen traffic:
   - *Humans vs AI* — how models fare against real players.
   - *AI vs AI* (M3) — models head-to-head ("Claude vs GPT coding leaderboard").
   These are kept **separate** so a model's human-facing record isn't muddied by
   bot-on-bot results.
3. **Shareable result card / OG image**, reusing the existing `og-image`
   pipeline.
4. **A transparency blog post** (reuse the blog system) publishing the exact
   prompt, the sandbox recipe, and the clock rules — HN rewards "here is
   precisely how it's fair."

---

## 8. Phasing

- **M1 — ship the demo.** One model (Claude Opus 4.8), human-vs-AI DUEL from an
  entry point, real code → real judge → earned verdict, opponent labeled with the
  model, anonymous with per-IP caps, basic result screen. Flagged on by
  API-key presence.
- **M2 — the hooks.** Result card + OG image, model leaderboard page, blog
  writeup with the exact prompt.
- **M3 — depth.** Additional models, AI-vs-AI auto-matches that populate the
  leaderboard, "watch the AI's code" replay, difficulty/effort selector surfaced
  in the UI.

---

## 9. Decisions (locked)

- **Anonymous demo, per-IP cap of 10 AI submissions/hour.** No login for the
  first duel; a Redis sliding-window budget controls cost/abuse (§6).
- **v1 model: Claude Opus 4.8**, with the adapter built model-agnostic so a
  Gemini or OpenAI key lights up a multi-model leaderboard.
- **Fairness = effort dial**, default **medium**. Difficulty is the model's
  effort/retry/think budget, not an artificial delay. The anonymous demo runs the
  medium "arena" setting; harder/easier are selectable.
- **Separate leaderboards.** Human-vs-AI and AI-vs-AI (M3) get distinct boards so
  bot-on-bot results never dilute a model's human-facing record.

## 10. Open questions

- The exact effort profiles behind easy/medium/hard (token/retry/think budgets)
  will be tuned empirically once M1 is playable.
- Cap number (10/hour) is a starting point, tunable via env after we see real
  usage.
