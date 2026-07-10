---
title: "Designing a Fair Elo System for Coding Contests"
date: "2026-07-21"
author: "Matthew"
description: "Classic Elo is built for two players. Here's how Code Arena generalizes it to rate N-player coding contests and real-time matches fairly — using expected rank, geometric-mean targeting, damping, and a zero-sum correction."
---

# Designing a Fair Elo System for Coding Contests

Every accepted solution on Code Arena moves your rating. That single sentence hides a surprising amount of design. Elo — the rating system from chess — was built for exactly two players. But a coding contest has *fifty* players, all ranked at once. A Battle Royale has six. How do you turn a standings table into a fair, single number that goes up when you outperform expectations and down when you don't?

Here's how we designed Code Arena's rating engine, why the obvious approaches fail, and the handful of properties that make a rating feel *fair* instead of arbitrary.

## Why classic Elo doesn't fit

Classic Elo works on a single game between players A and B. It asks: given their ratings, what was the expected result? Then it nudges both toward reality. The expected score for A against B is a logistic curve:

```typescript
function winProb(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}
```

The `400` is the famous constant: a 400-point gap means the favorite is expected to win about 10-to-1. This function is the one piece of classic Elo we keep verbatim. Everything else has to change, because a contest isn't one game — it's an all-play-all tournament resolved in a single sitting.

The naive fix is to treat a contest as every pairwise game at once: you "beat" everyone ranked below you and "lost" to everyone above. But summing pairwise Elo updates over a 50-player field is unstable and double-counts — a strong player who wins swings wildly, and the math doesn't conserve rating across the field. We needed something built for the multiplayer case.

## The core idea: expected rank

The trick — borrowed from the Codeforces rating system — is to stop thinking about wins and losses and think about **rank**. Every player has an *expected* finishing position given everyone's pre-contest rating, and an *actual* finishing position from the standings. Rating change is a function of the gap between them.

Your expected rank, which we call your **seed**, is one plus the sum of the probabilities that each *other* player beats you:

```typescript
function seed(rating: number, others: Participant[], selfId: string): number {
  // Expected rank = 1 + sum of win probabilities of every other player over self.
  let s = 1;
  for (const o of others) if (o.userId !== selfId) s += winProb(o.rating, rating);
  return s;
}
```

This is elegant. If you're the strongest player in the room, everyone else has a low probability of beating you, so your seed is close to 1 — we expect you to win. If you're the weakest, almost everyone is expected to beat you, so your seed is close to `n`. The seed is a smooth, rating-aware prediction of where you *should* finish.

## Finding your new rating

Now we have two numbers per player: their seed (expected rank) and their actual rank. If you finished exactly where you were seeded, your rating shouldn't move. If you beat your seed, it should rise; if you fell short, it should fall.

We combine the two with a **geometric mean** — `sqrt(seed × actualRank)` — and then ask: *what rating would have produced that combined rank as its seed?* That target rating is found by binary search over the seed function, since seed is monotonic in rating:

```typescript
const s = seed(p.rating, participants, p.userId);
const mid = Math.sqrt(s * p.rank);          // blend expected and actual
const target = ratingForSeed(mid, ...);      // invert seed() via binary search
const delta = Math.round((target - p.rating) / 2);
```

Two details are doing quiet, important work here.

The **geometric mean** (rather than a plain average) keeps the blend proportional: over-performing from rank 20 to rank 10 is treated similarly to going from rank 2 to rank 1 — a halving either way — which matches how players actually perceive improvement.

The **division by two** is our damping factor — Elo's "K-factor" in spirit. We only move a player halfway to their computed target. Ratings should be sticky: one lucky (or unlucky) contest shouldn't rewrite your rank. Damping trades a little responsiveness for a lot of stability, and it's the single knob we'd tune if ratings ever felt too jumpy.

## Keeping it zero-sum

Rating should be roughly conserved — points won by over-performers should come *from* under-performers, not printed out of thin air. Because each delta is computed independently, rounding and the damping can leave a small net drift. So we apply a correction that redistributes any aggregate shift evenly across the field:

```typescript
const totalShift = deltas.reduce((acc, d) => acc + d.delta, 0);
const correction = -Math.trunc(totalShift / n);
```

It's a small touch, but it's what stops the whole population's ratings from slowly inflating or deflating over hundreds of contests. Our test suite pins this down explicitly: across a field, the sum of all deltas stays within a point or two of zero.

## The fairness properties that matter

An algorithm is only "fair" if it produces the outcomes people intuitively expect. We encoded those expectations as tests, and they double as the design spec:

- **Beating a stronger opponent gains more than beating a weaker one.** An upset — winning when you were seeded to lose — is where rating should move most. Beating someone 400 points above you is worth far more than beating someone 400 below.
- **A favorite who underperforms loses rating**, even if they didn't finish last. If you were seeded first and came third, the system saw an under-performance and adjusts down.
- **Ties share the lower rank**, so two players who genuinely tie are treated identically — no coin-flip advantage from standings order.
- **It's fully deterministic.** Given the same standings and pre-contest ratings, the recompute produces the exact same deltas, every time. No randomness, no dependence on processing order. That reproducibility (one of our core requirements) means a rating change can always be explained and audited after the fact.

## One engine, two game modes

The nice payoff of ranking-based rating is that it doesn't care *how* the ranking was produced. The same `recomputeRatings` function powers two very different experiences:

- **Contests** — a scored standings table (problems solved, penalty time) becomes a rank list, which becomes rating deltas.
- **Real-time matches** — a Battle Royale finishes with a placement (who survived longest, who was eliminated in which round); a 1v1 Duel finishes with a winner and a loser. Those placements feed the exact same engine.

So a clutch Battle Royale win against five higher-rated players moves your rank using the identical math that governs a 50-person contest. There's one definition of "fair" on the platform, not two.

## Takeaways

If you're building a rating system for anything multiplayer — contests, tournaments, ranked matches — a few principles carried the whole design:

- **Rank, not wins.** Convert "who beat whom" into expected-vs-actual finishing position. It generalizes cleanly from 2 players to 2,000.
- **Predict, then measure the surprise.** The rating change is a function of how far reality diverged from a rating-aware prediction — that's what rewards upsets and punishes flops automatically.
- **Damp aggressively.** Move players a fraction of the way to their target. Sticky ratings feel fair; twitchy ones feel random.
- **Conserve the total.** A zero-sum correction keeps the whole population's numbers meaningful over time.
- **Make it deterministic.** If you can't reproduce a rating change from the standings alone, you can't defend it — and players *will* ask.

Ratings are the quiet backbone of a competitive platform. Get them right and every accepted solution feels like it means something. Get them wrong and the whole ladder feels arbitrary. On Code Arena, that backbone is about sixty lines of very deliberate math.
