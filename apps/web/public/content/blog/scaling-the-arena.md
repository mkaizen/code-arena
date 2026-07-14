---
title: "Building Code Arena: Scaling WebSockets & Docker Sandboxes for a Battle Royale"
date: "2026-06-09"
author: "Matthew"
description: "A deep dive into Code Arena's architecture: decoupling submission spikes with BullMQ, sandboxing untrusted code with Docker and cgroups, streaming verdicts over Redis pub/sub and per-user WebSockets, and orchestrating a real-time coding Battle Royale."
---

# Building Code Arena: Scaling WebSockets & Docker Sandboxes for a Battle Royale

When building a standard competitive coding platform, the architecture is relatively straightforward: a user submits code, a queue processes it, and the database updates. But when you introduce a **Battle Royale** mechanic—six players racing an ascending-difficulty ladder, eliminated the moment they miss a round's timer—the engineering requirements change entirely.

Suddenly you have hard real-time deadlines, a synchronized "shrinking zone" that must stay consistent across every player's screen, and untrusted code being executed dozens of times a second under a strict clock. Here's a deep dive into how Code Arena handles the contest-start spike, executes untrusted code securely, streams live verdicts to the frontend, and keeps a real-time match honest.

## Decoupling the spike with BullMQ and Redis

One of the biggest non-functional requirements in competitive programming is graceful degradation under load. When a contest starts—or a Battle Royale round flips and six players slam submit at once—we see sharp spikes in submissions.

If our API tried to judge these synchronously, it would immediately fall over. Instead, the Fastify API acts as a lightweight router. When a submission hits `POST /submissions`, the API does only cheap work: validate the contest/match window against the server clock, enforce the sequential-unlock rules, persist a `PENDING` row, and push a job onto a **BullMQ** queue backed by Redis. The HTTP request returns in milliseconds with a `202 Accepted`.

We actually run *two* queues. The `judge` queue handles real submissions that count toward standings. A separate `run` queue backs the interactive "Run against samples" button, so a player debugging their code never sits behind a backlog of contest submissions—debug latency and scoring latency are isolated failure domains.

This decoupling means capacity is a dial, not a rewrite. Judging is CPU-bound and embarrassingly parallel, so we scale it by spinning up more `@arena/judge` worker processes—each just pulls the next job from Redis. If the queue backs up during a round flip, players might wait an extra second for a verdict, but the ingest path and the API stay completely responsive.

## The execution sandbox: Docker and cgroups

Executing untrusted user code is the scariest part of the whole system. We need a sandbox that blocks network exfiltration, contains fork bombs, kills infinite loops, and enforces exact memory limits—per problem, and without trusting the program to behave.

Each judge worker launches an ephemeral Docker container per run. Compilation and execution are separate invocations (compilers get a generous 10s / 512MB; the actual run gets the problem's real limits), and every container is locked down the same way:

```typescript
const args = [
  "run", "--rm", "-i",
  "--network=none",                 // no exfiltration, no callbacks home
  "--read-only",                    // immutable rootfs
  "--cap-drop=ALL",                 // drop every Linux capability
  "--security-opt=no-new-privileges",
  "--pids-limit=64",                // fork bombs hit a wall
  `--memory=${mb}m`,
  `--memory-swap=${mb}m`,           // == memory, so no swapping to disk
  "--cpus=1",                       // single-core lock for fair timing
  "--tmpfs", "/tmp:rw,size=64m",    // only scratch space is writable
  "--tmpfs", "/home/runner:rw,size=16m",
  "-v", `${dir}:/work:rw`,
  "-w", "/work",
  recipe.image,                     // arena-sandbox:cpp, :py, :rs, ...
  ...argv,
];
```

The container runs as an unprivileged user (uid 10001) on a read-only filesystem—the only writable surfaces are small tmpfs mounts and the per-run `/work` directory. A few subtleties matter here:

- **Timeouts** are enforced by the host, not the guest. We give the process its time limit plus a ~1.5s grace for interpreter startup, then `SIGKILL` the container. A program that ignores signals or spins forever can't outlast the wall-clock killer.
- **Out-of-memory** shows up as Docker exit code `137`. If the process was OOM-killed (and *not* wall-clock killed), we report `MLE` rather than a generic runtime error, so players get an honest verdict.
- **Measuring peak memory** without trusting the program is the fun part. Rather than polling from outside, we wrap the run command so that after the program exits, the container reads the kernel's own high-water mark from its cgroup—cgroup v2's `memory.peak`, falling back to v1's `max_usage_in_bytes`—and writes it to `/work/.mem` for the host to read back:

```sh
"$@"; rc=$?;
{ cat /sys/fs/cgroup/memory.peak \
  || cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes \
  || cat /sys/fs/cgroup/memory.current; } > /work/.mem 2>/dev/null;
exit $rc
```

That's the real number the kernel accounted, not an estimate—and if the counter isn't readable on a given host, the file is simply absent and memory reports as 0. No image rebuild, nothing breaks.

## Streaming verdicts: Redis pub/sub meets per-user WebSockets

A verdict is useless if it arrives as a page refresh. Players need to see `Accepted` (or `Wrong Answer on test 7`) the instant the judge finishes. But the judge workers and the WebSocket connections live in different processes—workers shouldn't (and can't cleanly) hold thousands of browser sockets.

So we bridge them with Redis pub/sub. When a worker finishes, it publishes the result to a channel—`arena:verdicts` for submissions, `arena:runs` for debug runs. The API subscribes once and fans each message out to the right browsers over WebSockets. Workers stay stateless; the socket layer stays in the API.

The fan-out is deliberately scoped. Every socket authenticates with a JWT passed as a `?token=` query parameter, binding the connection to a `userId` (or leaving it anonymous for logged-out spectators). That lets the hub distinguish **private** events from **public** ones:

- A **verdict is private to its author**—`sendToUser(userId, …)` delivers your result only to your sockets. You never see someone else's raw verdict stream.
- A **leaderboard update is public**—`broadcast(…)` pushes it to every connected client, including the logged-out landing page watching a contest live.
- A **match state change** goes to exactly the players in that match via `sendToUsers([...])`.

This split—private by default, broadcast only where it's genuinely shared—is what keeps a live contest feeling instantaneous without leaking information between competitors.

## Orchestrating the Battle Royale

The Battle Royale mode is where the real-time constraints get sharp. The rules are encoded in one config:

```typescript
ROYALE: { capacity: 6, roundDurationSec: 300, rounds: 6 }
DUEL:   { capacity: 2, roundDurationSec: 600, rounds: 3 }
```

Six players queue up; when the queue hits capacity, a match is formed with a ladder of six ascending-difficulty problems. Each round runs on a hard timer—`roundStartedAt + roundDurationSec`—and that timer *is* the shrinking zone. Solve the problem before it expires and you advance; miss it and you're eliminated. Last player standing wins.

Two failure modes make this harder than it looks:

**Lost timers.** A round advances either when it's resolved early (someone solves it) or when its `setTimeout` fires. But an in-memory `setTimeout` doesn't survive an API restart or deploy—so a match could freeze forever. We back the timers with a periodic sweep (`sweepOverdueMatches`) that reconciles any round whose deadline has passed against the authoritative timestamps in Postgres. The server clock, not the client and not a fragile timer, is the source of truth.

**Rage-quits and dropped connections.** In a rated match, a player who closes their tab shouldn't stall everyone else. The client sends a heartbeat while it's alive; if we see no heartbeat for the 30-second grace window, a forfeit sweep marks that player as having abandoned the match and the round resolves without them. New matches seed each player's heartbeat at creation, so nobody is falsely forfeited before their client has even connected.

When a match finishes, every player's Elo is recomputed together and persisted—the same rating engine contests use—so a Battle Royale win actually moves your rank.

## Takeaways

None of these pieces are individually exotic—a queue, a container, a pub/sub channel, a timer. What makes a real-time competitive platform work is the *seams* between them:

- Push slow, spiky, dangerous work (judging) off the request path and behind a queue you can scale horizontally.
- Never trust the guest—let the host and the kernel enforce time, memory, and privileges, and read the kernel's own accounting rather than the program's.
- Decouple the processes that *produce* events from the ones that *hold the connections*, and scope every event to exactly who should see it.
- For anything real-time, make the server clock and the database the source of truth, and assume every in-memory timer and every client connection will eventually vanish.

That's the machinery behind a coding Battle Royale that stays fair, fast, and stable when six people hit submit at the same second.
