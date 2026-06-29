import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Verdict } from "@arena/shared";
import type { Recipe } from "./recipes.js";

export interface RunOutcome {
  verdict: Verdict | null; // null means "ran cleanly, compare output"
  stdout: string;
  timeMs: number;
  memoryKb: number;
  compileLog?: string;
  runtimeLog?: string; // program stderr / exit code detail on RUNTIME_ERROR
}

/**
 * Run one program against one input inside a hardened container (NFR-3):
 *   --network=none, read-only rootfs, dropped caps, pid/mem/cpu caps, wall-clock kill.
 * Requires the per-language sandbox images to be built (see Dockerfile.sandbox).
 */
export async function runInSandbox(
  recipe: Recipe,
  source: string,
  input: string,
  limits: { timeMs: number; memoryKb: number },
): Promise<RunOutcome> {
  const dir = await mkdtemp(join(tmpdir(), "arena-"));
  try {
    // mkdtemp creates the dir 0700 (owner-only). The sandbox container runs as
    // an unprivileged user (uid 10001), so it must be able to traverse /work
    // to read the source and write compiled artifacts. Open up the per-run dir.
    await chmod(dir, 0o777);
    await writeFile(join(dir, recipe.source), source, { mode: 0o644 });

    if (recipe.compile) {
      const c = await dockerRun(recipe, dir, recipe.compile, "", {
        timeMs: 10_000,
        memoryKb: 512 * 1024,
      });
      if (c.code !== 0) {
        return { verdict: Verdict.CE, stdout: "", timeMs: 0, memoryKb: 0, compileLog: c.stderr.slice(0, 4000) };
      }
    }

    const r = await dockerRun(recipe, dir, recipe.run, input, limits);
    if (r.timedOut) return { verdict: Verdict.TLE, stdout: "", timeMs: r.timeMs, memoryKb: r.memoryKb };
    if (r.oom) return { verdict: Verdict.MLE, stdout: "", timeMs: r.timeMs, memoryKb: r.memoryKb };
    if (r.code !== 0) {
      const detail = r.stderr.trim() || `process exited with code ${r.code}`;
      return { verdict: Verdict.RE, stdout: r.stdout, timeMs: r.timeMs, memoryKb: r.memoryKb, runtimeLog: detail.slice(0, 4000) };
    }
    return { verdict: null, stdout: r.stdout, timeMs: r.timeMs, memoryKb: r.memoryKb };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timeMs: number;
  memoryKb: number;
  timedOut: boolean;
  oom: boolean;
}

function dockerRun(
  recipe: Recipe,
  dir: string,
  argv: string[],
  input: string,
  limits: { timeMs: number; memoryKb: number },
): Promise<ExecResult> {
  const wallMs = limits.timeMs + 1500; // grace for process startup before hard kill
  const args = [
    "run", "--rm", "-i",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=64",
    `--memory=${Math.ceil(limits.memoryKb / 1024)}m`,
    "--memory-swap=" + Math.ceil(limits.memoryKb / 1024) + "m",
    "--cpus=1",
    "--tmpfs", "/tmp:rw,size=64m",
    "--tmpfs", "/home/runner:rw,size=16m",
    "-v", `${dir}:/work:rw`,
    "-w", "/work",
    recipe.image,
    ...argv,
  ];

  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn("docker", args);
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const killer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, wallMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    if (input) child.stdin.write(input);
    child.stdin.end();

    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({
        code,
        stdout,
        stderr,
        timeMs: Date.now() - start,
        memoryKb: 0, // populated from cgroup stats in a fuller build
        timedOut,
        oom: code === 137 && !timedOut, // docker OOM kill
      });
    });
  });
}
