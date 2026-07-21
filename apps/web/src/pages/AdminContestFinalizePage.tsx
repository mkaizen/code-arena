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

const STATUS_COLOR: Record<ReturnType<typeof getStatus>, string> = {
  UPCOMING: "var(--txt-3)",
  LIVE: "var(--v-ac)",
  ENDED: "var(--txt-3)",
};

export function AdminContestFinalizePage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [result, setResult] = useState<Record<string, { finalized: number; error?: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  useEffect(() => {
    api.contests().then(setContests).catch(() => {});
  }, []);

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

  async function handleDelete(c: Contest) {
    if (!window.confirm(
      `Delete "${c.name}"? This removes the contest, its standings, and its rating-change history. ` +
      "Submissions stay in players' histories, and already-applied rating changes are not rewound.",
    )) return;
    setDeleting(c.id);
    setDeleteError((prev) => ({ ...prev, [c.id]: "" }));
    try {
      await api.adminDeleteContest(c.id);
      setContests((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setDeleteError((prev) => ({ ...prev, [c.id]: (err as Error).message }));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 8 }}>Manage Contests</h1>
        <p style={{ fontSize: 13, color: "var(--txt-3)", marginBottom: 28 }}>
          Finalize runs the Elo recompute for a finished rated contest (safe to call once — re-calls are rejected).
          Delete removes a contest and its standings for good.
        </p>

        {contests.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--txt-3)", fontStyle: "italic" }}>No contests found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {contests.map((c) => {
              const status = getStatus(c);
              const res = result[c.id];
              const canFinalize = c.rated && status === "ENDED" && !res;
              return (
                <div key={c.id} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--txt)", marginBottom: 2 }}>
                      {c.name}{" "}
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: STATUS_COLOR[status], marginLeft: 6 }}>
                        {status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--txt-3)" }}>
                      {new Date(c.startsAt).toLocaleString()} · {Math.floor(c.durationSec / 3600)}h · {c.scoring} · {c.rated ? "rated" : "unrated"}
                    </div>
                    {deleteError[c.id] && <div style={{ marginTop: 6, fontSize: 12, color: "var(--v-wa)" }}>{deleteError[c.id]}</div>}
                  </div>

                  {res && (
                    res.error ? (
                      <span style={{ fontSize: 13, color: "var(--v-wa)" }}>{res.error}</span>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--v-ac)", fontWeight: 600 }}>✓ {res.finalized} ratings updated</span>
                    )
                  )}
                  {canFinalize && (
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
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deleting === c.id}
                    style={{
                      background: "transparent", color: "var(--v-wa)", border: "1px solid var(--v-wa)",
                      fontWeight: 700, fontSize: 13, padding: "7px 16px", borderRadius: 6,
                      cursor: deleting === c.id ? "not-allowed" : "pointer",
                      fontFamily: "var(--disp)", opacity: deleting === c.id ? 0.6 : 1, flexShrink: 0,
                    }}
                  >
                    {deleting === c.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
