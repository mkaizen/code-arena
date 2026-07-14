---
title: "Measuring a Program's True Peak Memory with cgroups"
date: "2026-06-16"
author: "Matthew"
description: "How to get the exact peak memory a program used — not an estimate — by reading the Linux kernel's own cgroup high-water mark (memory.peak), with fallbacks for cgroup v1, from inside a Docker sandbox."
---

# Measuring a Program's True Peak Memory with cgroups

Code Arena has to tell you two things about every submission: was it fast enough, and did it fit in memory? Timing is easy — you wrap the process and read the wall clock. Memory is deceptively hard. You can't ask the program how much it used; it will lie, or crash before it answers. And sampling from the outside almost always misses the peak.

Here's how we get the *exact* high-water mark the kernel accounted — down to the byte — without trusting the program at all.

## Why sampling doesn't work

The obvious approach is to poll: every few milliseconds, read the process's `RSS` from `/proc/<pid>/status` or `smaps`, and keep the maximum. This fails for a simple reason — **peak memory is instantaneous**. A program can allocate a gigabyte, use it for one millisecond, and free it before your next poll. Your sampler reports 40MB; the real peak was 1GB. Tighten the polling interval and you burn CPU fighting the very workload you're trying to measure, and you *still* have a race.

Worse, in a judge you're running dozens of these a second inside separate containers. A polling loop per container, racing the process it's watching, is exactly the kind of complexity you don't want in the hot path.

## Let the kernel do the accounting

The Linux kernel already tracks this for you, exactly, for free. When a process runs inside a **cgroup** (which every Docker container does), the kernel maintains a running high-water mark of that cgroup's memory usage. In cgroup v2 it's exposed as a single file:

```
/sys/fs/cgroup/memory.peak
```

Reading it gives you the maximum memory the cgroup ever touched over its lifetime — the true peak, tracked by the memory allocator itself, with zero sampling and zero races. There's nothing to poll and nothing to miss.

The catch is portability: `memory.peak` is relatively recent, and older hosts run cgroup v1, where the equivalent lives at a different path (`memory.max_usage_in_bytes`). And if *neither* is readable, we'd still like a sensible number rather than a crash. So we try them in order and fall back gracefully:

```sh
"$@"; rc=$?;
{ cat /sys/fs/cgroup/memory.peak \
  || cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes \
  || cat /sys/fs/cgroup/memory.current; } > /work/.mem 2>/dev/null;
exit $rc
```

That snippet is the whole trick. Let's unpack what it's doing.

## Reading it from *inside* the sandbox

Our judge runs each submission in a locked-down container: `--network=none`, read-only root filesystem, all capabilities dropped. From the host, prying into the container's cgroup files after it exits is fiddly and version-dependent. It's far simpler to have the container measure *itself* and hand the number back.

So we wrap the actual run command in a tiny shell script:

1. `"$@"` runs the real program (the compiled binary, the Python interpreter, whatever), and we stash its exit code in `rc`.
2. **After** it exits, we read the cgroup high-water mark and write those bytes to `/work/.mem`.
3. We re-`exit $rc` so the wrapper is transparent — the caller still sees the program's real exit code.

`/work` is a directory we bind-mount from the host (`-v ${dir}:/work:rw`), so the moment the container is gone, the host just reads the file back:

```typescript
async function readPeakKb(dir: string): Promise<number> {
  try {
    const raw = (await readFile(join(dir, ".mem"), "utf8")).trim();
    const bytes = Number.parseInt(raw, 10);
    return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1024) : 0;
  } catch {
    return 0;
  }
}
```

No `docker exec` into a live container, no cgroup spelunking from the host, no privileged access. The measurement rides out on a plain file next to the program's output.

## Failing soft, on purpose

Notice the `2>/dev/null` on the probe and the fallback-to-zero on the read. This is deliberate. Judges run on wildly different hosts — a beefy bare-metal box, a cheap VPS, someone's laptop, a CI runner. On some of them none of those cgroup files will be readable (nested containers, restricted mounts, an unusual kernel config).

When that happens, we don't want the judge to error, retry, or report a bogus verdict. We want it to say "memory: 0" (i.e. "unknown") and move on. The `|| cat ... || cat ...` chain degrades from *exact peak* → *exact peak (v1)* → *current usage* → *absent*, and the host-side read treats an absent or unparseable file as `0`. The submission is still judged for correctness and time; only the memory figure is missing, and only on hosts that can't provide it. **No image rebuild, nothing breaks.**

That last property matters more than it sounds. A measurement system that occasionally can't measure should never take down the thing it's measuring.

## The takeaways

If you ever need a program's true peak memory — for a judge, a benchmark harness, a resource monitor — skip the sampler:

- **Read the kernel's accounting, not the program's.** `memory.peak` (cgroup v2) is the exact high-water mark, tracked for free. Sampling from outside races the workload and misses transient peaks.
- **Measure from inside the sandbox and pass the number out through a file.** It's simpler and more portable than reaching into a container's cgroup from the host.
- **Chain fallbacks and fail soft.** cgroup v2 → v1 → current usage → absent-means-unknown. A metric that can't be collected on some host shouldn't break the pipeline.

It's four lines of shell and a `readFile`. The kernel was already doing the hard part — you just have to ask it the right question.
