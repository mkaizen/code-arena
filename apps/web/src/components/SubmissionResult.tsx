import { type JudgeResult, verdictSummary } from "@arena/shared";

function verdictColor(v: string): string {
  if (v === "ACCEPTED") return "var(--v-ac)";
  if (["WRONG_ANSWER", "RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"].includes(v)) return "var(--v-wa)";
  if (v === "TIME_LIMIT_EXCEEDED") return "var(--v-tle)";
  if (v === "COMPILATION_ERROR") return "var(--v-ce)";
  if (["PENDING", "JUDGING"].includes(v)) return "var(--v-judge)";
  return "var(--txt-2)";
}

function verdictLabel(v: string): string {
  const map: Record<string, string> = {
    ACCEPTED: "Accepted", WRONG_ANSWER: "Wrong Answer", TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
    MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded", RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error", INTERNAL_ERROR: "Internal Error", PENDING: "Pending", JUDGING: "Judging…",
  };
  return map[v] ?? v;
}

const logStyle: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 11, whiteSpace: "pre-wrap", margin: "6px 0 0",
  color: "var(--txt-2)", background: "var(--panel-2)", border: "1px solid var(--line)",
  borderRadius: 6, padding: "6px 8px", maxHeight: 160, overflow: "auto",
};

/**
 * Rich display of a judged submission: the verdict, a "passed X / Y tests"
 * summary with a per-test dot strip, timing, and the failure detail the judge
 * already provides. Hidden test input/expected are never shown — only the
 * player's own program output.
 */
export function SubmissionResult({ result }: { result: JudgeResult }) {
  const c = verdictColor(result.verdict);
  const { passed, total, failedCase } = verdictSummary(result);
  const showBar = total > 0 && result.verdict !== "COMPILATION_ERROR" && result.verdict !== "INTERNAL_ERROR";
  const ac = result.verdict === "ACCEPTED";

  return (
    <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: c, fontWeight: 700 }}>{verdictLabel(result.verdict)}</span>
        {result.maxTimeMs > 0 && <span style={{ color: "var(--txt-3)" }}>{result.maxTimeMs}ms</span>}
        {result.maxMemoryKb > 0 && <span style={{ color: "var(--txt-3)" }}>{(result.maxMemoryKb / 1024).toFixed(1)}MB</span>}
      </div>

      {showBar && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: ac ? "var(--v-ac)" : "var(--txt-2)", fontWeight: 600 }}>
              Passed {passed} / {total} test{total === 1 ? "" : "s"}
            </span>
            {failedCase != null && <span style={{ color: c }}>failed on test {failedCase}</span>}
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const bg = ac || (failedCase != null && n < failedCase)
                ? "var(--v-ac)"
                : failedCase === n ? c : "var(--line)";
              return <span key={i} title={`test ${n}`} style={{ width: 9, height: 9, borderRadius: 2, background: bg, flexShrink: 0 }} />;
            })}
          </div>
        </div>
      )}

      {result.message && <div style={{ color: "var(--txt-2)", marginTop: 6, fontSize: 11, whiteSpace: "pre-wrap" }}>{result.message}</div>}
      {result.compileLog && <pre style={logStyle}>{result.compileLog}</pre>}
      {result.runtimeLog && <pre style={logStyle}>{result.runtimeLog}</pre>}
      {result.failedStdout && <pre style={logStyle}>Your output on that test:{"\n"}{result.failedStdout}</pre>}
      {result.failedStderr && <pre style={{ ...logStyle, color: "var(--v-tle)" }}>Stderr (debug prints):{"\n"}{result.failedStderr}</pre>}
    </div>
  );
}
