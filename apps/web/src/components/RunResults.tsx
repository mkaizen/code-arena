import type { RunCaseResult, RunResult } from "@arena/shared";

const STATUS_META: Record<RunCaseResult["status"], { label: string; color: string }> = {
  PASS: { label: "Passed", color: "var(--v-ac)" },
  FAIL: { label: "Wrong Output", color: "var(--v-wa)" },
  RAN: { label: "Ran", color: "var(--v-judge)" },
  COMPILATION_ERROR: { label: "Compile Error", color: "var(--v-ce)" },
  RUNTIME_ERROR: { label: "Runtime Error", color: "var(--v-wa)" },
  TIME_LIMIT_EXCEEDED: { label: "Time Limit", color: "var(--v-tle)" },
  MEMORY_LIMIT_EXCEEDED: { label: "Memory Limit", color: "var(--v-wa)" },
};

const preStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: 5,
  padding: "6px 8px",
  color: "var(--txt)",
  overflow: "auto",
  margin: "2px 0 0",
  whiteSpace: "pre-wrap",
  maxHeight: 120,
};

const labelStyle: React.CSSProperties = { fontSize: 10, color: "var(--txt-3)", fontWeight: 600, letterSpacing: "0.04em" };

function Block({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <pre style={{ ...preStyle, color: color ?? "var(--txt)" }}>{value === "" ? "(empty)" : value}</pre>
    </div>
  );
}

export function RunResults({ result, running }: { result: RunResult | null; running: boolean }) {
  if (running) {
    return <div style={{ color: "var(--v-judge)", fontSize: 12, fontFamily: "var(--mono)" }}>Running against samples…</div>;
  }
  if (!result) return null;

  const passed = result.cases.filter((c) => c.status === "PASS").length;
  const total = result.cases.filter((c) => c.status === "PASS" || c.status === "FAIL").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {total > 0 && (
        <div style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: passed === total ? "var(--v-ac)" : "var(--v-wa)" }}>
          {passed}/{total} sample{total === 1 ? "" : "s"} passed
        </div>
      )}
      {result.compileLog && (
        <pre style={{ ...preStyle, color: "var(--v-ce)", maxHeight: 160 }}>{result.compileLog}</pre>
      )}
      {result.cases.map((c, i) => {
        const meta = STATUS_META[c.status];
        return (
          <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, background: "var(--panel)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--txt)" }}>{c.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</span>
              {c.timeMs > 0 && <span style={{ fontSize: 11, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>{c.timeMs}ms</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: c.expected != null ? "1fr 1fr 1fr" : "1fr", gap: 8 }}>
              <Block label="INPUT" value={c.input} />
              <Block label="YOUR OUTPUT" value={c.stdout} color={c.status === "FAIL" ? "var(--v-wa)" : undefined} />
              {c.expected != null && <Block label="EXPECTED" value={c.expected} color="var(--v-ac)" />}
            </div>
            {c.stderr && <Block label="STDERR (debug prints)" value={c.stderr} color="var(--v-tle)" />}
          </div>
        );
      })}
    </div>
  );
}
