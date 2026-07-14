import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import type { MatchMode, ServerEvent } from "@arena/shared";

const MODE_META: Record<MatchMode, { title: string; tagline: string; blurb: string }> = {
  ROYALE: {
    title: "Battle Royale",
    tagline: "6 players · elimination ladder · 5 min per round",
    blurb: "One ascending-difficulty problem ladder. Miss the timer on a round and you're eliminated — last one standing wins.",
  },
  DUEL: {
    title: "1v1 Duel",
    tagline: "2 players · best of 3 · 10 min per problem",
    blurb: "Three rounds, head to head. First accepted solution takes the round — win two rounds to take the match.",
  },
};

export function BattlePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queuedMode, setQueuedMode] = useState<MatchMode | null>(null);
  const [counts, setCounts] = useState<Record<MatchMode, number>>({ ROYALE: 0, DUEL: 0 });
  const [capacities, setCapacities] = useState<Record<MatchMode, number>>({ ROYALE: 6, DUEL: 2 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<MatchMode | "leave" | null>(null);
  const [practicing, setPracticing] = useState<MatchMode | null>(null);
  const navigated = useRef(false);

  useEffect(() => {
    if (!user) return;
    api.matchQueueStatus()
      .then((s) => { setQueuedMode(s.queuedMode); setCounts(s.counts); setCapacities(s.capacities); })
      .catch(() => {});
  }, [user]);

  useWs((ev: ServerEvent) => {
    if (ev.type === "queue_update") {
      setCounts((c) => ({ ...c, [ev.mode]: ev.count }));
      setCapacities((c) => ({ ...c, [ev.mode]: ev.capacity }));
    } else if (ev.type === "match_found" && user && ev.playerIds.includes(user.id) && !navigated.current) {
      navigated.current = true;
      navigate(`/battle/${ev.matchId}`);
    }
  });

  async function handleQueue(mode: MatchMode) {
    if (!user) { navigate("/login"); return; }
    setError("");
    setLoading(mode);
    try {
      const res = await api.queueForMatch(mode);
      if (res.matched && res.matchId) {
        navigated.current = true;
        navigate(`/battle/${res.matchId}`);
      } else {
        setQueuedMode(mode);
        setCounts((c) => ({ ...c, [mode]: res.count }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("leave");
    try {
      await api.leaveMatchQueue();
      setQueuedMode(null);
    } finally {
      setLoading(null);
    }
  }

  async function handlePractice(mode: MatchMode) {
    if (!user) { navigate("/login"); return; }
    setError("");
    setPracticing(mode);
    try {
      const { matchId } = await api.startPracticeMatch(mode);
      navigated.current = true;
      navigate(`/battle/${matchId}`);
    } catch (e) {
      setError((e as Error).message);
      setPracticing(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 720 }}>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)", marginBottom: 4, textAlign: "center" }}>
            Battle Modes
          </h1>
          <p style={{ color: "var(--txt-3)", fontSize: 13, marginBottom: 24, textAlign: "center" }}>
            Real-time head-to-head coding. Pick your format.
          </p>

          {error && (
            <div style={{ background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)", borderRadius: 6, padding: "8px 12px", color: "var(--v-wa)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {(["ROYALE", "DUEL"] as MatchMode[]).map((mode) => {
              const meta = MODE_META[mode];
              const isQueuedHere = queuedMode === mode;
              const busy = loading === mode || loading === "leave";
              return (
                <div
                  key={mode}
                  style={{
                    background: "var(--panel)",
                    border: `1px solid ${isQueuedHere ? "rgba(63,185,80,0.4)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: 28,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <h2 style={{ fontFamily: "var(--disp)", fontSize: 19, fontWeight: 700, color: "var(--txt)", marginBottom: 2 }}>
                    {meta.title}
                  </h2>
                  <div style={{ color: "var(--v-ac)", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 12 }}>
                    {meta.tagline}
                  </div>
                  <p style={{ color: "var(--txt-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 20, flex: 1 }}>
                    {meta.blurb}
                  </p>

                  <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, color: "var(--v-ac)", marginBottom: 2 }}>
                    {counts[mode]}/{capacities[mode]}
                  </div>
                  <div style={{ color: "var(--txt-3)", fontSize: 11, marginBottom: 18, letterSpacing: "0.05em" }}>
                    {isQueuedHere ? "WAITING FOR PLAYERS…" : "PLAYERS IN QUEUE"}
                  </div>

                  {isQueuedHere ? (
                    <button
                      onClick={handleCancel}
                      disabled={busy}
                      style={{
                        background: "transparent", border: "1px solid var(--line)", borderRadius: 8,
                        color: "var(--txt-2)", fontWeight: 600, fontSize: 14, padding: "11px 0",
                        width: "100%", cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--disp)",
                      }}
                    >
                      {loading === "leave" ? "Leaving…" : "Leave Queue"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleQueue(mode)}
                      disabled={busy}
                      style={{
                        background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
                        padding: "11px 0", width: "100%", border: "none", borderRadius: 8,
                        cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--disp)", opacity: busy ? 0.7 : 1,
                      }}
                    >
                      {loading === mode ? "Queueing…" : queuedMode ? "Switch to this Queue" : "Queue Up"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Practice vs bots — no queue, unrated */}
          <div style={{ marginTop: 16, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "22px 24px", textAlign: "center" }}>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 17, fontWeight: 700, color: "var(--txt)", marginBottom: 4 }}>
              🤖 Practice vs Bots
            </h2>
            <p style={{ color: "var(--txt-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 16, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              No queue, no waiting, and unrated. Warm up against bots that play like real students — bracketed to your rating, so it feels like a fair lobby.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {(["ROYALE", "DUEL"] as MatchMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handlePractice(mode)}
                  disabled={practicing !== null}
                  style={{
                    background: "transparent", color: "var(--v-tle)", border: "1px solid var(--v-tle)",
                    fontWeight: 700, fontSize: 13, padding: "9px 18px", borderRadius: 8,
                    cursor: practicing !== null ? "not-allowed" : "pointer", fontFamily: "var(--disp)",
                    opacity: practicing !== null && practicing !== mode ? 0.5 : 1,
                  }}
                >
                  {practicing === mode ? "Starting…" : `Practice ${MODE_META[mode].title}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
