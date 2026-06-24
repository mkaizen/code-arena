import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api, type Contest } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

function getStatus(c: Contest): "UPCOMING" | "LIVE" | "ENDED" {
  const now = Date.now();
  const start = new Date(c.startsAt).getTime();
  const end = start + c.durationSec * 1000;
  if (now < start) return "UPCOMING";
  if (now < end) return "LIVE";
  return "ENDED";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function Countdown({ startsAt }: { startsAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function update() {
      const diff = new Date(startsAt).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startsAt]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-2)" }}>
      starts in {h > 0 ? `${h}h ` : ""}{m}m {s}s
    </span>
  );
}

export function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.contests()
      .then(setContests)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const [registered, setRegistered] = useState<Set<string>>(new Set());

  async function handleRegister(id: string) {
    if (!user) { navigate("/login"); return; }
    setRegistering(id);
    try {
      await api.registerContest(id);
      setRegistered((s) => new Set([...s, id]));
    } catch (e) {
      const msg = (e as Error).message;
      // "already registered" isn't an error from the user's perspective
      if (!msg.includes("already")) alert(msg);
      setRegistered((s) => new Set([...s, id]));
    } finally {
      setRegistering(null);
    }
  }

  async function handleEnter(id: string) {
    if (!user) { navigate("/login"); return; }
    // Auto-register on Enter so users don't have to click Register first
    try { await api.registerContest(id); } catch { /* already registered is fine */ }
    navigate(`/contests/${id}`);
  }

  const statusBadge = (status: "UPCOMING" | "LIVE" | "ENDED") => {
    const styles: Record<string, React.CSSProperties> = {
      UPCOMING: { color: "var(--v-judge)", background: "rgba(76,141,255,0.12)", border: "1px solid rgba(76,141,255,0.25)" },
      LIVE: { color: "var(--v-ac)", background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.25)" },
      ENDED: { color: "var(--txt-3)", background: "rgba(92,101,113,0.12)", border: "1px solid rgba(92,101,113,0.25)" },
    };
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 4,
          fontFamily: "var(--disp)",
          ...styles[status],
        }}
      >
        {status === "LIVE" && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--v-ac)",
              display: "inline-block",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        )}
        {status}
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 900, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        <h1
          style={{
            fontFamily: "var(--disp)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--txt)",
            marginBottom: 24,
          }}
        >
          Contests
        </h1>

        {loading && (
          <div style={{ color: "var(--txt-2)", textAlign: "center", padding: 48 }}>Loading…</div>
        )}

        {error && (
          <div style={{ color: "var(--v-wa)", padding: 16, background: "rgba(255,92,92,0.1)", borderRadius: 8, border: "1px solid rgba(255,92,92,0.2)" }}>
            {error}
          </div>
        )}

        {!loading && !error && contests.length === 0 && (
          <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 48 }}>No contests yet.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {contests.map((c) => {
            const status = getStatus(c);
            return (
              <div
                key={c.id}
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--disp)",
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--txt)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.name}
                    </span>
                    {statusBadge(status)}
                    {c.rated && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 7px",
                          borderRadius: 4,
                          background: "rgba(163,113,247,0.12)",
                          color: "var(--t-cm)",
                          border: "1px solid rgba(163,113,247,0.25)",
                          fontFamily: "var(--disp)",
                        }}
                      >
                        RATED
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 20, color: "var(--txt-2)", fontSize: 12 }}>
                    <span>{formatDate(c.startsAt)}</span>
                    <span>{formatDuration(c.durationSec)}</span>
                    <span style={{ color: "var(--txt-3)" }}>{c.scoring}</span>
                    {status === "UPCOMING" && <Countdown startsAt={c.startsAt} />}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {status === "UPCOMING" && (
                    <button
                      onClick={() => handleRegister(c.id)}
                      disabled={registering === c.id}
                      style={{
                        background: registered.has(c.id) ? "rgba(63,185,80,0.12)" : "transparent",
                        border: `1px solid ${registered.has(c.id) ? "rgba(63,185,80,0.3)" : "var(--line)"}`,
                        borderRadius: 6,
                        color: registered.has(c.id) ? "var(--v-ac)" : "var(--txt-2)",
                        fontSize: 13,
                        fontWeight: 500,
                        padding: "6px 14px",
                        cursor: "pointer",
                        opacity: registering === c.id ? 0.6 : 1,
                      }}
                    >
                      {registered.has(c.id) ? "Registered ✓" : registering === c.id ? "Registering…" : "Register"}
                    </button>
                  )}
                  {status === "LIVE" && (
                    <button
                      onClick={() => handleEnter(c.id)}
                      style={{
                        background: "var(--v-ac)",
                        border: "none",
                        borderRadius: 6,
                        color: "#06210C",
                        fontSize: 13,
                        fontWeight: 700,
                        padding: "6px 16px",
                        cursor: "pointer",
                        fontFamily: "var(--disp)",
                      }}
                    >
                      Enter
                    </button>
                  )}
                  {status === "ENDED" && (
                    <button
                      onClick={() => navigate(`/contests/${c.id}`)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        color: "var(--txt-3)",
                        fontSize: 13,
                        fontWeight: 500,
                        padding: "6px 14px",
                        cursor: "pointer",
                      }}
                    >
                      Results
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
