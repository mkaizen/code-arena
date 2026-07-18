import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { ChallengeAi } from "../components/ChallengeAi.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import type { LiveMatchSummary, MatchMode, ServerEvent } from "@arena/shared";

const MODE_META: Record<MatchMode, { title: string; tagline: string; blurb: string }> = {
  ROYALE: {
    title: "Battle Royale",
    tagline: "6 players · elimination ladder · 5 min per round",
    blurb: "One ascending-difficulty problem ladder. Miss the timer on a round and you're eliminated — last one standing wins.",
  },
  QUADS: {
    title: "Quad Royale",
    tagline: "4 players · elimination ladder · 5 min per round",
    blurb: "The same elimination ladder, four across. Miss the timer on a round and you're out — last one standing takes it. Quicker to fill, quicker to finish.",
  },
  DUEL: {
    title: "1v1 Duel",
    tagline: "2 players · best of 3 · 10 min per problem",
    blurb: "Three rounds, head to head. First accepted solution takes the round — win two rounds to take the match.",
  },
};

/**
 * While a queue is partially full, bots backfill the empty seats at a deadline
 * so a match always starts. This ticks that down so the wait reads as
 * intentional ("a match is coming") rather than broken ("nobody's here").
 */
function FillCountdown({ deadline }: { deadline: string | null }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!deadline) { setRemaining(0); return; }
    const end = new Date(deadline).getTime();
    const update = () => setRemaining(Math.max(0, end - Date.now()));
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const s = Math.ceil(remaining / 1000);
  return (
    <div style={{ color: "var(--v-tle)", fontSize: 11, marginBottom: 14, letterSpacing: "0.02em" }}>
      {s > 0 ? `🤖 Bots fill the empty seats in ${s}s` : "Starting…"}
    </div>
  );
}

export function BattlePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queuedMode, setQueuedMode] = useState<MatchMode | null>(null);
  const [counts, setCounts] = useState<Record<MatchMode, number>>({ ROYALE: 0, QUADS: 0, DUEL: 0 });
  const [capacities, setCapacities] = useState<Record<MatchMode, number>>({ ROYALE: 6, QUADS: 4, DUEL: 2 });
  const [fillDeadlines, setFillDeadlines] = useState<Record<MatchMode, string | null>>({ ROYALE: null, QUADS: null, DUEL: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<MatchMode | "leave" | null>(null);
  const [practicing, setPracticing] = useState<MatchMode | null>(null);
  const [live, setLive] = useState<LiveMatchSummary[]>([]);
  const navigated = useRef(false);

  useEffect(() => {
    if (!user) return;
    api.matchQueueStatus()
      .then((s) => { setQueuedMode(s.queuedMode); setCounts(s.counts); setCapacities(s.capacities); setFillDeadlines(s.fillDeadlines); })
      .catch(() => {});
  }, [user]);

  // The "Live now" list — polled, since matches start and end without a signal
  // on this page (it's public, so logged-out visitors can watch too).
  useEffect(() => {
    let stopped = false;
    const load = () => api.liveMatches().then((m) => { if (!stopped) setLive(m); }).catch(() => {});
    load();
    const t = setInterval(load, 12_000);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  useWs((ev: ServerEvent) => {
    if (ev.type === "queue_update") {
      setCounts((c) => ({ ...c, [ev.mode]: ev.count }));
      setCapacities((c) => ({ ...c, [ev.mode]: ev.capacity }));
      setFillDeadlines((d) => ({ ...d, [ev.mode]: ev.fillDeadline ?? null }));
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
            {(["ROYALE", "QUADS", "DUEL"] as MatchMode[]).map((mode) => {
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
                  <div style={{ color: "var(--txt-3)", fontSize: 11, marginBottom: isQueuedHere ? 6 : 18, letterSpacing: "0.05em" }}>
                    {isQueuedHere ? "WAITING FOR PLAYERS…" : "PLAYERS IN QUEUE"}
                  </div>

                  {isQueuedHere && <FillCountdown deadline={fillDeadlines[mode]} />}

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

          {/* Challenge the AI — no queue, no signup, unrated */}
          <div style={{ marginTop: 16 }}>
            <ChallengeAi />
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
              {(["ROYALE", "QUADS", "DUEL"] as MatchMode[]).map((mode) => (
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

          {/* Live now — spectate a match already in progress. */}
          {live.length > 0 && (
            <div style={{ marginTop: 16, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--v-wa)", animation: "pulse 1.4s ease-in-out infinite" }} />
                <h2 style={{ fontFamily: "var(--disp)", fontSize: 15, fontWeight: 700, color: "var(--txt)" }}>Live now</h2>
                <span style={{ fontSize: 11, color: "var(--txt-3)" }}>· {live.length} match{live.length === 1 ? "" : "es"} in progress</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {live.map((m) => {
                  const names = m.players.map((p) => (p.isBot ? "🤖 " : "") + p.handle).join(" · ");
                  return (
                    <Link
                      key={m.id}
                      to={`/watch/${m.id}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
                        background: "var(--panel-2)", border: "1px solid var(--line)", textDecoration: "none",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--v-ac)", fontFamily: "var(--disp)", flexShrink: 0, width: 54 }}>
                        {m.mode === "DUEL" ? "Duel" : m.mode === "QUADS" ? "Quads" : "Royale"}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--txt-2)", fontFamily: "var(--mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {names || "—"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--txt-3)", flexShrink: 0 }}>R{m.round + 1}/{m.totalRounds}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--v-wa)", flexShrink: 0, fontFamily: "var(--disp)" }}>Watch →</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
