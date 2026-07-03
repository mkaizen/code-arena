import { useCallback, useRef, useState } from "react";
import type { Language, RunResult, ServerEvent } from "@arena/shared";
import { api } from "../api.js";

/**
 * Drives the "Run" (test against samples / custom input) flow. The result
 * comes back asynchronously over the WebSocket; feed events in via onEvent.
 */
export function useRun(problemId: string | undefined) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const pendingId = useRef<string | null>(null);

  const start = useCallback(
    async (language: Language, source: string, customInput?: string) => {
      if (!problemId) return;
      setRunning(true);
      setResult(null);
      try {
        const { runId } = await api.run({ problemId, language, source, customInput });
        pendingId.current = runId;
      } catch (e) {
        setRunning(false);
        setResult({ runId: "", cases: [{ label: "Error", input: "", expected: null, stdout: "", stderr: (e as Error).message, timeMs: 0, status: "RUNTIME_ERROR" }] });
      }
    },
    [problemId],
  );

  const onEvent = useCallback((ev: ServerEvent) => {
    if (ev.type === "run_result" && ev.runId === pendingId.current) {
      pendingId.current = null;
      setRunning(false);
      setResult(ev.result);
    }
  }, []);

  const clear = useCallback(() => setResult(null), []);

  return { running, result, start, onEvent, clear };
}
