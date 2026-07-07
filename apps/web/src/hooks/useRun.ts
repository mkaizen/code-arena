import { useCallback, useRef, useState } from "react";
import type { Language, RunResult, ServerEvent } from "@arena/shared";
import { api } from "../api.js";

/**
 * Drives the "Run" (test against samples / custom input) flow.
 *
 * Logged-in clients receive the result over the WebSocket (feed events in via
 * onEvent). Logged-out clients have no authenticated socket, so when `poll` is
 * set the hook polls GET /run/:runId until the judge finishes — this is what
 * lets guests run code during onboarding before creating an account.
 */
export function useRun(problemId: string | undefined, opts: { poll?: boolean } = {}) {
  const { poll = false } = opts;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const pendingId = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((r: RunResult) => {
    pendingId.current = null;
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
    setRunning(false);
    setResult(r);
  }, []);

  const start = useCallback(
    async (language: Language, source: string, customInput?: string) => {
      if (!problemId) return;
      setRunning(true);
      setResult(null);
      try {
        const { runId } = await api.run({ problemId, language, source, customInput });
        pendingId.current = runId;

        if (poll) {
          // Poll for up to ~40s; the judge is normally sub-second but a cold
          // queue can lag. Stop as soon as a result appears.
          let tries = 0;
          const tick = async () => {
            if (pendingId.current !== runId) return; // superseded/cancelled
            try {
              const { result: r } = await api.runResult(runId);
              if (r) { finish(r); return; }
            } catch { /* transient — keep polling */ }
            if (++tries > 40) {
              finish({ runId, cases: [{ label: "Timeout", input: "", expected: null, stdout: "", stderr: "Timed out waiting for the judge. Please try again.", timeMs: 0, status: "RUNTIME_ERROR" }] });
              return;
            }
            pollTimer.current = setTimeout(tick, 1000);
          };
          pollTimer.current = setTimeout(tick, 800);
        }
      } catch (e) {
        setRunning(false);
        setResult({ runId: "", cases: [{ label: "Error", input: "", expected: null, stdout: "", stderr: (e as Error).message, timeMs: 0, status: "RUNTIME_ERROR" }] });
      }
    },
    [problemId, poll, finish],
  );

  const onEvent = useCallback((ev: ServerEvent) => {
    if (ev.type === "run_result" && ev.runId === pendingId.current) {
      finish(ev.result);
    }
  }, [finish]);

  const clear = useCallback(() => setResult(null), []);

  return { running, result, start, onEvent, clear };
}
