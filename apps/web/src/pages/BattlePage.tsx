import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import type { ServerEvent } from "@arena/shared";

export function BattlePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queued, setQueued] = useState(false);
  const [count, setCount] = useState(0);
  const [capacity, setCapacity] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigated = useRef(false);

  useEffect(() => {
    if (!user) return;
    api.matchQueueStatus()
      .then((s) => { setQueued(s.queued); setCount(s.count); setCapacity(s.capacity); })
      .catch(() => {});
  }, [user]);

  useWs((ev: ServerEvent) => {
    if (ev.type === "queue_update") {
      setCount(ev.count);
      setCapacity(ev.capacity);
    } else if (ev.type === "match_found" && user && ev.playerIds.includes(user.id) && !navigated.current) {
      navigated.current = true;
      navigate(`/battle/${ev.matchId}`);
    }
  });

  async function handleQueue() {
    if (!user) { navigate("/login"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await api.queueForMatch();
      if (res.matched && res.matchId) {
        navigated.current = true;
        navigate(`/battle/${res.matchId}`);
      } else {
        setQueued(true);
        setCount(res.count);
        setCapacity(res.capacity);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    try {
      await api.leaveMatchQueue();
      setQueued(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 420, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>
            Battle Royale
          </h1>
          <p style={{ color: "var(--txt-3)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            6 players, one ascending-difficulty problem ladder. Miss the timer on a round and you're eliminated — last one standing wins.
          </p>

          <div style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color: "var(--v-ac)", marginBottom: 4 }}>
            {count}/{capacity}
          </div>
          <div style={{ color: "var(--txt-3)", fontSize: 12, marginBottom: 24, letterSpacing: "0.05em" }}>
            {queued ? "WAITING FOR PLAYERS…" : "PLAYERS IN QUEUE"}
          </div>

          {error && (
            <div style={{ background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)", borderRadius: 6, padding: "8px 12px", color: "var(--v-wa)", fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {queued ? (
            <button
              onClick={handleCancel}
              disabled={loading}
              style={{
                background: "transparent", border: "1px solid var(--line)", borderRadius: 8,
                color: "var(--txt-2)", fontWeight: 600, fontSize: 14, padding: "11px 0",
                width: "100%", cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--disp)",
              }}
            >
              {loading ? "Leaving…" : "Leave Queue"}
            </button>
          ) : (
            <button
              onClick={handleQueue}
              disabled={loading}
              style={{
                background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
                padding: "11px 0", width: "100%", border: "none", borderRadius: 8,
                cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--disp)", opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Queueing…" : "Queue Up"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
