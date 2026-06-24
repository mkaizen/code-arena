import { useState, useEffect } from "react";
import { TopBar } from "../components/TopBar.js";
import { api, type Contest } from "../api.js";

function getStatus(c: Contest): "UPCOMING" | "LIVE" | "ENDED" {
  const now = Date.now();
  const start = new Date(c.startsAt).getTime();
  const end = start + c.durationSec * 1000;
  if (now < start) return "UPCOMING";
  if (now < end) return "LIVE";
  return "ENDED";
}

export function AdminContestFinalizePage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [result, setResult] = useState<Record<string, { finalized: number; error?: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    api.contests().then(setContests).catch(() => {});
  }, []);

  const ended = contests.filter((c) => c.rated && getStatus(c) === "ENDED");

  async function finalize(id: string) {
    setLoading(id);
    try {
      const res = await api.adminFinalizeContest(id);
      setResult((prev) => ({ ...prev, [id]: { finalized: res.finalized } }));
    } catch (err) {
      setResult((prev) => ({ ...prev, [id]: { finalized: 0, error: (err as Error).message } }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 8 }}>Finalize Ratings</h1>
        <p style={{ fontSize: 13, color: "var(--txt-3)", marginBottom: 28 }}>Runs Elo recompute for a finished rated contest. Safe to call once — re-calls are rejected.</p>

        {ended.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--txt-3)", fontStyle: "italic" }}>No ended rated contests found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ended.map((c) => {
              const res = result[c.id];
              return (
                <div key={c.id} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--txt)", marginBottom: 2 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--txt-3)" }}>
                      {new Date(c.startsAt).toLocaleString()} · {Math.floor(c.durationSec / 3600)}h · {c.scoring}
                    </div>
                  </div>
                  {res ? (
                    res.error ? (
                      <span style={{ fontSize: 13, color: "var(--v-wa)" }}>{res.error}</span>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--v-ac)", fontWeight: 600 }}>✓ {res.finalized} ratings updated</span>
                    )
                  ) : (
                    <button
                      onClick={() => finalize(c.id)}
                      disabled={loading === c.id}
                      style={{
                        background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 13,
                        padding: "8px 20px", border: "none", borderRadius: 6, cursor: loading === c.id ? "not-allowed" : "pointer",
                        fontFamily: "var(--disp)", opacity: loading === c.id ? 0.7 : 1, flexShrink: 0,
                      }}
                    >
                      {loading === c.id ? "Running…" : "Finalize"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
