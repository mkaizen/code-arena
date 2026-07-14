---
title: "Sizing a 100-Player Battle Royale: Scale the Judge, Not the Sockets"
date: "2026-07-08"
author: "Matthew"
description: "Scaling a real-time coding Battle Royale from 6 players to 100 isn't a networking problem — it's a judging problem. Working from Code Arena's real sandbox limits (2s, 256MB, one core per container) to judge-seconds per submission, round-1 load, and a concrete server spec."
---

# Sizing a 100-Player Battle Royale: Scale the Judge, Not the Sockets

Code Arena runs its Battle Royale at six players to a match today. But six is a number in a config file, not a law of physics — which raises a question worth working through for anyone who enjoys capacity planning: what would it take to run one at a **hundred**?

The interesting part is that the obvious answer is the wrong one. A hundred simultaneous players *sounds* like a networking problem — all those live connections to hold open — but the network layer barely notices. The entire cost lives somewhere most people don't look first. This post walks from the real constants in our codebase to a concrete server spec, with a few infographics along the way.

## First, where the load *isn't*

A hundred concurrent players sounds like a lot of connections, and it is — but connections are cheap. Each player holds a single WebSocket. One Node/Fastify process handles thousands of those without breaking a sweat, and because the real-time layer now fans out over a [Redis bus](/blog/fanning-out-websockets-across-a-cluster), you can run several API replicas behind it anyway. Broadcasting a leaderboard to 100 clients on each solve is a rounding error. Redis (queues plus pub/sub) and Postgres (a few writes a second) are just as unbothered.

The cost is concentrated in exactly one place: **executing untrusted code**. Every submission — and every "Run against samples" click — launches a hardened Docker container pinned to a single core. That's the meter that runs. So let's price it properly.

## The pipeline, and the one expensive step

```
   100 players hitting submit / run
                |
                v
        +---------------+   cheap work only:
        |  Fastify API  |   validate, persist PENDING,
        |  -> 202 in ms |   enqueue a job. Never judges inline.
        +-------+-------+
                |  enqueue
                v
     +-------------------------+   two isolated queues:
     |  Redis + BullMQ queues  |   judge (scored) | run (debug)
     +------------+------------+
                  | workers pull jobs
       +----------+----------+----------- ... ----------+
       v          v          v                          v
    worker 1   worker 2   worker 3                    worker N
       |          |          |                          |
       v          v          v                          v
    docker     docker     docker                     docker    <- THE
   (1 core,   (1 core,   (1 core,                   (1 core,      COST
    256 MB)    256 MB)    256 MB)                    256 MB)
       +----------+----------+----------- ... ----------+
                  | verdict -> Redis pub/sub
                  v
       fan-out over arena:ws bus -> the player's WebSocket
```

We deliberately keep the API doing almost nothing on the hot path — it validates the round window, writes a `PENDING` row, drops a job on a BullMQ queue, and returns `202` in milliseconds. All the weight lands on the judge workers, and each worker judges one submission at a time on one core, because we launch every container with `--cpus=1` for fair, isolated timing. **Concurrency equals the number of judge cores.** That one fact drives the entire calculation.

## Pricing one submission in "judge-seconds"

Here are the real limits, straight from our code. Every seeded problem runs with a 2-second time limit inside a 256 MB sandbox; the host adds a 1.5-second grace before a hard `SIGKILL`, and compiled languages get a separate 10s / 512 MB compile container first. A submission runs its (typically five) hidden tests **sequentially**, bailing on the first failure.

So the natural unit of work is a *judge-second*: one second of one core running one container. A correct compiled solution looks like this:

```
 One correct C++ submission = 6 containers, back-to-back,
 on ONE core:

   compile  ##########        ~2.0 s   (10s / 512MB cap)
   test 1   ##                 ~0.4 s
   test 2   ##                 ~0.4 s   each run: 2s limit
   test 3   ##                 ~0.4 s   + 1.5s grace
   test 4   ##                 ~0.4 s   = 3.5s hard ceiling
   test 5   ##                 ~0.4 s
            ------------------------------
   total    ~ 4 judge-seconds  (1 core, ~4s of wall time)

 A wrong answer exits on the first failing test, so it's
 CHEAP -- the correct solutions are the expensive ones.
```

A few things fall out of this that are worth internalizing:

- **~4 judge-seconds** is a good central estimate for a scored submission. Interpreted languages skip the compile container (~2.5 js); a pathological near-TLE solution that burns the full 3.5s on every test costs ~18 js. Most real submissions cluster near 4.
- A **debug run** only touches the two public sample tests, so it's cheaper — call it **~2.5 judge-seconds**.
- Early-exit means **wrong answers are cheap and correct answers are expensive**. That's counterintuitive, but it's the *successful* solves that cost the most compute.

## Round 1 is the whole game

Battle Royale eliminates any player who misses a round's timer, so the field collapses as the match goes on — and the load collapses with it. Round 1, with all 100 players alive and grinding, is peak. Everything after is downhill.

```
 Miss a round's timer, you're out -- so the field (and the
 judge load) roughly halves each round:

   Round 1   100 players  ####################  100% load
   Round 2   ~50          ##########            ~50%
   Round 3   ~25          #####                 ~25%
   Round 4   ~12          ###                   ~12%
   Round 5   ~6           #                      ~6%
   Round 6   ~3 -> winner |                      ~3%

 Size for Round 1. Everything after is free.
```

Here's the round-1 worksheet. The round is 300 seconds long. The only real assumptions are about player behavior — how many times each person submits and runs — so they're stated plainly below and easy to dial for your own audience:

```
 ROUND 1  ·  100 players alive  ·  300-second window

   submissions  100 players x 2.5 each = 250  x 4.0 js = 1000 js
   sample runs  100 players x 8   each = 800  x 2.5 js = 2000 js
                                                 ------------------
                                   total work  ~ 3000 judge-seconds

   3000 js  /  300 s  =  ~10 cores just to break even
```

Notice that runs, not submissions, dominate the bill — players test against the samples far more often than they submit. The separate `run` queue keeps that debug traffic from blocking the scored `judge` queue, but it's the same physical cores doing both jobs. Break-even (~10 cores) means the queue neither grows nor shrinks *on average* — but "on average" hides the deadline burst, when a crowd of still-alive players slam their final submit in the last few seconds. To keep verdicts snappy through that burst, you want real headroom:

```
 Deadline burst: ~40 alive players submit at once = ~160 js
 arriving in a couple of seconds. Time to drain that backlog
 (lower is better):

    8 cores  ####################  ~20 s   keeps up on average,
                                            laggy at the deadline
   16 cores  ##########            ~10 s   recommended
   32 cores  #####                  ~5 s   snappy under bursts
```

Because judging degrades gracefully — a backed-up queue just means verdicts arrive a beat later, nobody is blocked or dropped — the core count is really a choice about *how fast* the verdict comes back at the worst moment, not about whether the system survives. In a rated contest where the round timer is the shrinking zone, keeping that latency low is a competitive-integrity feature, not a nicety.

## The spec

Judging is the dial; everything else is a small fixed cost. Sizing the whole stack for a 100-player royale:

```
 TIER         vCPU    RAM      ROLE
 --------------------------------------------------------------
 Judge        16-32   24-48G   the whole ballgame; 1 core per
 workers              (~1G      container. Prefer 2-4 boxes of
                       /core)   8 cores -- horizontal + resilient
 API          2-4     4-8G     100 sockets is trivial; run 2
                               replicas (Redis arena:ws bus)
 Redis        1-2     1-2G     queues + pub/sub + SET NX claims
 Postgres     2       4G       a few writes per second
 --------------------------------------------------------------
 All-in-one   24-32   32-48G   one box, whole royale -- simpler,
                               less resilient than a split tier
```

The RAM figure on the judge tier isn't arbitrary. Peak concurrent containers ≈ core count, each run container caps at 256 MB and each compile container at 512 MB, plus roughly 80 MB of tmpfs per container and Docker's own overhead. Budgeting ~1 GB per judge core keeps you clear of the OOM killer even if every core is mid-compile at once.

If we were provisioning this tomorrow, the pick would be a **16-core judge tier** (ideally two 8-core boxes), a small 2–4 core API box, and modest Redis and Postgres. That runs a 100-player round 1 with verdicts landing in a few seconds even through the deadline crush. Push the judge tier to 32 cores for a marquee event where you want the burst to feel instant.

And here's the part of the architecture that pays off most for this use case: because judge workers are stateless and simply pull from the Redis queue, the judge tier is a **dial, not a rewrite**. A 100-player royale peaks for about five minutes and then decays as players are eliminated, so there's no need to pay for that capacity around the clock — you autoscale the workers up ahead of a scheduled royale and back down once it's over. Capacity planning turns into a scheduling problem, which is a much nicer problem to have.

## Two caveats worth stating plainly

This whole analysis is about *compute*, and it assumes 100-player royales are actually wired up. Two things the code would need first:

1. **The config.** `MODE_CONFIG.ROYALE` is `{ capacity: 6, roundDurationSec: 300, rounds: 6 }`. A hundred-player match is a capacity bump. Six elimination rounds happen to narrow 100 → ~1 about right if roughly half the field washes out each round; if eliminations are gentler, you'd want a seventh. The 6-problem ladder is drawn from a ~97-problem bank, so there's no shortage of material.
2. **These are modeled numbers, not a load test.** The judge-seconds figures come from the real limits (2s / 256 MB / 1.5s grace / one core / sequential tests), but actual per-container wall time depends on the languages people write in and how close their solutions run to the limit. Before a real 100-player event, replay a few hundred synthetic submissions through the queue and watch the p95 verdict latency — the model tells you *roughly* where to aim; a load test tells you where you actually landed.

## Takeaways

- **Scale for the judge, not the sockets.** Real-time connections are cheap; executing untrusted code is the entire cost.
- **Price work in judge-seconds.** One correct compiled submission ≈ 4 seconds of one core; a debug run ≈ 2.5. Wrong answers are cheap (early-exit), correct ones are expensive.
- **Runs outweigh submissions, and round 1 outweighs the rest.** Size for the one 5-minute window where all 100 players are alive and hammering the sample runner.
- **~10 cores to break even, ~16 for comfort, ~32 to crush the deadline burst** — with everything else a small fixed cost.
- **The judge tier is a dial.** Stateless workers pulling from a queue mean you autoscale for the event and pay for compute by the minute, not the month.
