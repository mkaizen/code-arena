import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { tierOf, type ServerEvent, type MatchStateView, type MatchActivity } from "@arena/shared";
import { api, type Problem } from "../api.js";
import { useWs } from "../hooks/useWs.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { sanitizeStatement } from "../sanitize.js";
import { verdictColor, verdictLabel, diffColor, RoundTimer, playerStatus } from "../matchUi.js";

/**
 * Read-only spectator view of a live match. Same rounds, standings, feed, and
 * reactions the players see — but no editor, no submit, and never a line of
 * anyone's source. State arrives over a `spectate` WebSocket subscription; the
 * initial snapshot comes from the public /matches/:id/live endpoint.
 */
export function SpectatePage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<MatchStateView | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notLive, setNotLive] = useState(false);
  const [feed, setFeed] = useState<MatchActivity[]>([]);
  const [floats, setFloats] = useState<{ id: number; emoji: string; handle: string }[]>([]);
  const floatId = useRef(0);
  const isMobile = useMediaQuery("(max-width: 820px)");

  useEffect(() => {
    if (!id) return;
    api.watchMatch(id).then(setMatch).catch(() => setNotLive(true));
  }, [id]);

  // Pull the statement so watchers can follow along with what's being solved.
  useEffect(() => {
    if (!match?.problem) { setProblem(null); return; }
    api.problem(match.problem.slug).then(setProblem).catch(() => {});
  }, [match?.problem?.slug]);

  const handleWsEvent = useCallback((ev: ServerEvent) => {
    if (ev.type === "match_state" && ev.match.id === id) {
      setMatch(ev.match);
      setNotLive(false);
    } else if (ev.type === "match_activity" && ev.matchId === id) {
      setFeed((f) => [ev.event, ...f].slice(0, 40));
    } else if (ev.type === "match_reaction" && ev.matchId === id) {
      const fid = ++floatId.current;
      const { emoji, handle } = ev.reaction;
      setFloats((f) => [...f, { id: fid, emoji, handle }].slice(-14));
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 2200);
    }
  }, [id]);

  useWs(handleWsEvent, { spectateMatchId: id });

  if (notLive && !match) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--txt-3)", padding: 20, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18, color: "var(--txt)" }}>This match isn't live</div>
        <div style={{ fontSize: 14 }}>It may have already finished, or never started.</div>
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          {id && <Link to={`/replay/${id}`} style={{ color: "var(--v-ac)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Try the replay →</Link>}
          <Link to="/battle" style={{ color: "var(--txt-2)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Battle lobby</Link>
        </div>
      </div>
    );
  }
  if (!match) {
    return <div style={{ minHeight: "100dvh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>Loading…</div>;
  }

  const isDuel = match.mode === "DUEL";
  const finished = match.status === "FINISHED";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--ink)", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ height: 52, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0, gap: 16 }}>
        <Link to="/battle" style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--txt-3)", fontWeight: 400, fontSize: 13 }}>←</span>
          {isDuel ? <>1v1&nbsp;<span style={{ color: "var(--v-ac)" }}>Duel</span></> : <>Battle<span style={{ color: "var(--v-ac)" }}>Royale</span></>}
        </Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--v-wa)", border: "1px solid var(--v-wa)", borderRadius: 4, padding: "1px 7px", letterSpacing: "0.04em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--v-wa)", animation: finished ? undefined : "pulse 1.4s ease-in-out infinite" }} />
          {finished ? "ENDED" : "SPECTATING"}
        </span>
        <div style={{ flex: 1, fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14, color: "var(--txt)" }}>
          {finished ? "Match Finished" : `Round ${match.round + 1} / ${match.totalRounds}`}
        </div>
        {!finished && <RoundTimer endsAt={match.roundEndsAt} />}
      </header>

      {finished && (
        <div style={{ padding: "10px 20px", background: "rgba(63,185,80,0.08)", borderBottom: "1px solid rgba(63,185,80,0.2)", color: "var(--v-ac)", fontSize: 13, fontWeight: 600, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <span>The match has ended.</span>
          {id && (
            <Link to={`/replay/${id}`} style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--v-ac)", background: "transparent", border: "1px solid var(--v-ac)", padding: "3px 12px", borderRadius: 6, textDecoration: "none" }}>
              Watch Replay
            </Link>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
        {/* Left: the problem being solved */}
        <div style={{ flex: isMobile ? "0 0 auto" : 1, maxHeight: isMobile ? "38%" : undefined, minWidth: 0, overflow: "auto", padding: "16px 20px", borderBottom: isMobile ? "1px solid var(--line)" : undefined }}>
          {match.problem ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "var(--disp)", fontSize: 18, fontWeight: 700, color: "var(--txt)" }}>{match.problem.title}</h2>
                <span style={{ fontSize: 12, fontWeight: 700, color: diffColor(match.problem.difficulty) }}>
                  {match.problem.difficulty === "easy" ? "Easy" : match.problem.difficulty === "med" ? "Medium" : "Hard"}
                </span>
              </div>
              {problem ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeStatement(problem.statement) }} style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.7 }} />
              ) : (
                <div style={{ color: "var(--txt-3)", fontSize: 13 }}>Loading the problem…</div>
              )}
            </>
          ) : (
            <div style={{ color: "var(--txt-3)", fontSize: 13 }}>Between rounds…</div>
          )}
        </div>

        {/* Right: players + live feed */}
        <aside style={{ width: isMobile ? "auto" : 280, flex: isMobile ? 1 : undefined, minHeight: 0, flexShrink: 0, borderLeft: isMobile ? "none" : "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--line-soft)", fontSize: 10, letterSpacing: "0.1em", color: "var(--txt-3)", fontWeight: 600 }}>
            PLAYERS
          </div>
          {match.players.map((p) => {
            const tier = tierOf(p.rating);
            const st = playerStatus(p, match);
            return (
              <div key={p.userId} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", borderBottom: "1px solid var(--line-soft)", opacity: p.status === "ELIMINATED" ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {p.isBot ? (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: tier.color }}>🤖 {p.handle}</span>
                  ) : (
                    <Link to={`/u/${encodeURIComponent(p.handle)}`} style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: tier.color, textDecoration: "none" }}>{p.handle}</Link>
                  )}
                  {isDuel && <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 12, color: "var(--v-ac)", fontWeight: 700 }}>{p.roundWins}</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
              </div>
            );
          })}

          <div style={{ padding: "10px 12px 8px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line-soft)", fontSize: 10, letterSpacing: "0.1em", color: "var(--txt-3)", fontWeight: 600 }}>
            LIVE FEED
          </div>
          {feed.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "var(--txt-3)", fontSize: 12 }}>Submissions will show up here as players race.</div>
          ) : (
            feed.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid var(--line-soft)", fontFamily: "var(--mono)", fontSize: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: verdictColor(a.verdict), flexShrink: 0 }} />
                <span style={{ color: "var(--txt-2)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.isBot ? "🤖 " : ""}{a.handle}
                </span>
                <span style={{ color: verdictColor(a.verdict), marginLeft: "auto", whiteSpace: "nowrap" }}>{verdictLabel(a.verdict)}</span>
                <span style={{ color: "var(--txt-3)", flexShrink: 0 }}>R{a.round + 1}</span>
              </div>
            ))
          )}
        </aside>
      </div>

      {/* Floating emotes from the players, mirrored to watchers. */}
      <div style={{ position: "fixed", right: 24, bottom: 24, width: 180, height: 240, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}>
        {floats.map((fl) => (
          <div key={fl.id} style={{ position: "absolute", bottom: 0, right: (fl.id % 5) * 30, display: "flex", alignItems: "center", gap: 6, animation: "floatUp 2.2s ease-out forwards", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--txt-2)", textShadow: "0 1px 3px var(--ink)" }}>{fl.handle}</span>
            <span style={{ fontSize: 26, lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>{fl.emoji}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
