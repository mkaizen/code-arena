---
title: "Building Code Arena: Scaling WebSockets & Docker Sandboxes for a Battle Royale"
date: "2026-07-14"
author: "Matthew"
description: "How we decoupled API spikes from our execution engine using BullMQ, Redis, and dynamic Docker cgroups to run a real-time coding battle royale."
---

# Building Code Arena: Scaling WebSockets & Docker Sandboxes for a Battle Royale

When building a standard competitive coding platform, the architecture is relatively straightforward: a user submits code, a queue processes it, and the database updates. But when you introduce a **Battle Royale** mechanic—where constraints tighten dynamically, and dozens of players are simultaneously competing to survive the "shrinking zone"—the engineering requirements change entirely. 

Here is a deep dive into how Code Arena handles the "contest-start spike," executes untrusted code securely, and streams live verdicts to the frontend.

## Decoupling the Spike with BullMQ and Redis

One of the biggest non-functional requirements (NFR-2 / NFR-5) in competitive programming is graceful degradation under load. When a contest starts, or a zone shrinks, we see massive spikes in submissions. 

If our API tried to judge these synchronously, it would immediately fall over. Instead, our Fastify API acts as a lightweight router. When a submission hits the `/api/run` endpoint, it validates the contest window and pushes a job to **BullMQ**, backed by Redis.

This queue decouples the ingest from the execution. We can scale our judging capacity simply by spinning up more `@arena/judge` worker nodes. If the queue backs up during a zone shrink, players might wait an extra second for a verdict, but the system remains completely stable.

## The Execution Sandbox: Docker and cgroups

Executing untrusted user code is inherently dangerous. We needed a sandbox that prevents malicious network calls, stops fork bombs, and enforces strict, dynamic memory limits.

Our BullMQ workers launch ephemeral Docker containers for every submission. 

```typescript
const dockerArgs = [
  'run', '--rm',
  '--network', 'none',                 // 1. No internet access
  `--memory=${memoryLimitMb}m`,        // 2. Strict RAM limits
  `--memory-swap=${memoryLimitMb}m`,   // 3. No swapping to disk
  `--cpus=1.0`,                        // 4. Single-core lock
  '-v', `${codeFilePath}:/app/code:ro`,
  '-v', `${testBundlePath}:/app/tests:ro`,
  'arena-sandbox:cpp' 
];