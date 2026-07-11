import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api, type Contest, type PlagiarismReport } from "../api.js";

function scoreColor(score: number): string {
  if (score >= 0.95) return "var(--v-wa)"; // near-certain — red/warn
  if (score >= 0.85) return "#D29922"; // amber
  return "var(--txt-2)";
}

export function AdminPlagiarismPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [report, setReport] = useState<PlagiarismReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.contests().then(setContests).catch(() => {});
  }, []);

  async function scan(id: string) {
    setSelected(id);
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      setReport(await api.adminContestPlagiarism(id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const flaggedProblems = report?.reports.filter((r) => r.pairs.length > 0) ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 820, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 8 }}>
          Similarity Scan
        </h1>
        <p style={{ fontSize: 13, color: "var(--txt-3)", marginBottom: 28, lineHeight: 1.5 }}>
          Structural fingerprinting flags submission pairs that share code beyond
          coincidence — resistant to renaming and reformatting. This is a{" "}
          <strong style={{ color: "var(--txt-2)" }}>signal, not a verdict</strong>;
          always review the code before acting.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
          <select
            value={selected}
            onChange={(e) => e.target.value && scan(e.target.value)}
            style={{
              background: "var(--panel)", color: "var(--txt)", border: "1px solid var(--line)",
              borderRadius: 6, padding: "9px 12px", fontSize: 14, minWidth: 260,
            }}
          >
            <option value="">Select a contest to scan…</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {loading && <span style={{ fontSize: 13, color: "var(--txt-3)" }}>Scanning…</span>}
        </div>

        {error && <p style={{ fontSize: 14, color: "var(--v-wa)" }}>{error}</p>}

        {report && !loading && (
          flaggedProblems.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--v-ac)", fontStyle: "italic" }}>
              No similar pairs above threshold across {report.reports.length} problem(s). ✓
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {flaggedProblems.map((p) => (
                <section key={p.problemId}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                    <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, color: "var(--txt)" }}>{p.title}</h2>
                    <span style={{ fontSize: 12, color: "var(--txt-3)" }}>
                      {p.pairs.length} pair(s) · {p.submissionsCompared} compared
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.pairs.map((pair, i) => (
                      <div
                        key={i}
                        style={{
                          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
                          padding: "12px 16px", display: "flex", alignItems: "center", gap: 16,
                        }}
                      >
                        <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18, color: scoreColor(pair.similarity), width: 64, flexShrink: 0 }}>
                          {Math.round(pair.similarity * 100)}%
                        </span>
                        <div style={{ flex: 1, fontSize: 14, color: "var(--txt)" }}>
                          <Link to={`/u/${pair.a.handle}`} style={{ color: "var(--v-ac)", textDecoration: "none" }}>{pair.a.handle}</Link>
                          <span style={{ color: "var(--txt-3)" }}> ↔ </span>
                          <Link to={`/u/${pair.b.handle}`} style={{ color: "var(--v-ac)", textDecoration: "none" }}>{pair.b.handle}</Link>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--txt-3)", flexShrink: 0 }}>
                          {pair.sharedFingerprints} shared
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}
