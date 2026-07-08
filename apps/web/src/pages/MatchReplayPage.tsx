import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { MatchReplay, ReplayRound } from "@arena/shared";
import { tierOf } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  if (d === "hard") return "var(--v-wa)";
  return "var(--txt-3)";
}

function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function verdictColor(v: string): string {
  if (v === "ACCEPTED") return "var(--v-ac)";
  if (v === "TIME_LIMIT_EXCEEDED") return "var(--v-tle)";
  if (v === "COMPILATION_ERROR") return "var(--v-ce)";
  if (["PENDING", "JUDGING"].includes(v)) return "var(--v-judge)";
  return "var(--v-wa)";
}

function shortVerdict(v: string): string {
  const m: Record<string, string> = {
    ACCEPTED: "AC", WRONG_ANSWER: "WA", TIME_LIMIT_EXCEEDED: "TLE",
    MEMORY_LIMIT_EXCEEDED: "MLE", RUNTIME_ERROR: "RE", COMPILATION_ERROR: "CE", INTERNAL_ERROR: "IE",
  };
  return m[v] ?? v;
}

function RoundCard({ round, isDuel }: { round: ReplayRound; isDuel: boolean }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--txt-3)", letterSpacing: "0.05em" }}>
          ROUND {round.round + 1}
        </span>
        {round.problem && (
          <>
            <Link to={`/problems/${round.problem.slug}`} style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, color: "var(--txt)", textDecoration: "none" }}>
              {round.problem.title}
            </Link>
            <span style={{ fontSize: 12, fontWeight: 700, color: diffColor(round.problem.difficulty) }}>
              {round.problem.difficulty === "easy" ? "Easy" : round.problem.difficulty === "med" ? "Medium" : "Hard"}
            </span>
          </>
        )}
      </div>

      {round.entries.length === 0 ? (
        <div style={{ color: "var(--txt-3)", fontSize: 13 }}>No submissions this round.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {round.entries.map((e) => (
            <div key={e.userId} style={{ display: "grid", gridTemplateColumns: "20px 1fr 90px 70px", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span title={e.firstSolver ? "First to solve" : ""} style={{ textAlign: "center" }}>
                {e.firstSolver ? "⚡" : e.solved ? "✓" : "·"}
              </span>
              <Link to={`/u/${encodeURIComponent(e.handle)}`} style={{ fontFamily: "var(--mono)", fontWeight: 700, color: e.solved ? "var(--txt)" : "var(--txt-3)", textDecoration: "none" }}>
                {e.handle}{isDuel && e.firstSolver ? <span style={{ color: "var(--v-ac)", fontWeight: 600, fontSize: 11 }}> · won round</span> : null}
              </Link>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: e.solved ? "var(--v-ac)" : "var(--txt-3)", textAlign: "right" }}>
                {e.solved && e.solvedAtMs != null ? fmtClock(e.solvedAtMs) : "—"}
              </span>
              <span style={{ fontSize: 11, color: "var(--txt-3)", textAlign: "right" }}>
                {e.attempts} {e.attempts === 1 ? "try" : "tries"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchReplayPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [replay, setReplay] = useState<MatchReplay | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.matchReplay(id).then(setReplay).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--v-wa)" }}>{error}</div>
      </div>
    );
  }
  if (!replay) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>Loading replay…</div>
      </div>
    );
  }

  const isDuel = replay.mode === "DUEL";
  const winner = replay.players.find((p) => p.placement === 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 760, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)", margin: 0 }}>
            {isDuel ? "1v1 Duel" : "Battle Royale"} <span style={{ color: "var(--txt-3)", fontWeight: 500, fontSize: 16 }}>· Game Review</span>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to={`/share/${replay.id}`} style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "#06210C", background: "var(--v-ac)", padding: "6px 12px", borderRadius: 6, textDecoration: "none" }}>
              Share card
            </Link>
            <button
              onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 600, color: "var(--txt)", background: "var(--panel-2)", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
        <div style={{ color: "var(--txt-3)", fontSize: 13, marginBottom: 20 }}>
          {winner ? <>🏆 <Link to={`/u/${encodeURIComponent(winner.handle)}`} style={{ color: "var(--v-ac)", fontWeight: 700, textDecoration: "none" }}>{winner.handle}</Link> won</> : "Match complete"}
          {replay.durationMs != null && <> · {fmtClock(replay.durationMs)} · {replay.totalRounds} rounds</>}
        </div>

        {/* Final standings */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", fontSize: 10, letterSpacing: "0.1em", color: "var(--txt-3)", fontWeight: 600 }}>
            FINAL STANDINGS
          </div>
          {replay.players.map((p) => {
            const tier = tierOf(p.rating);
            const delta = p.ratingBefore != null && p.ratingAfter != null ? p.ratingAfter - p.ratingBefore : null;
            const isMe = p.userId === user?.id;
            return (
              <div key={p.userId} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto", gap: 10, padding: "10px 16px", alignItems: "center", borderBottom: "1px solid var(--line-soft)", background: isMe ? "var(--panel-2)" : "transparent" }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: p.placement === 1 ? "var(--v-ac)" : "var(--txt-3)" }}>
                  {p.placement === 1 ? "🏆" : `#${p.placement ?? "-"}`}
                </span>
                <Link to={`/u/${encodeURIComponent(p.handle)}`} style={{ fontFamily: "var(--mono)", fontWeight: 700, color: tier.color, textDecoration: "none" }}>
                  {p.handle}
                  {p.forfeited && <span style={{ color: "var(--v-wa)", fontSize: 11, fontWeight: 500 }}> · forfeit</span>}
                  {isDuel && <span style={{ color: "var(--txt-3)", fontSize: 11, fontWeight: 500 }}> · {p.roundWins} rounds</span>}
                  {!isDuel && p.eliminatedRound != null && p.placement !== 1 && <span style={{ color: "var(--txt-3)", fontSize: 11, fontWeight: 500 }}> · out R{p.eliminatedRound + 1}</span>}
                </Link>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)" }}>{p.ratingAfter ?? p.rating}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: delta == null ? "var(--txt-3)" : delta >= 0 ? "var(--v-ac)" : "var(--v-wa)", minWidth: 42, textAlign: "right" }}>
                  {delta == null ? "" : `${delta >= 0 ? "+" : ""}${delta}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Round-by-round */}
        <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 600, color: "var(--txt)", marginBottom: 12 }}>Round by round</h2>
        {replay.rounds.map((r) => <RoundCard key={r.round} round={r} isDuel={isDuel} />)}

        {/* Chronological feed */}
        {replay.timeline.length > 0 && (
          <>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 600, color: "var(--txt)", margin: "24px 0 12px" }}>Play-by-play</h2>
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              {replay.timeline.map((ev, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "58px 40px 1fr 40px", gap: 10, padding: "7px 16px", alignItems: "center", borderBottom: i < replay.timeline.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 12 }}>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--txt-3)" }}>{fmtClock(ev.atMs)}</span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--txt-3)" }}>R{ev.round + 1}</span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--txt-2)", fontWeight: 600 }}>{ev.handle}</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: verdictColor(ev.verdict), textAlign: "right" }}>{shortVerdict(ev.verdict)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
