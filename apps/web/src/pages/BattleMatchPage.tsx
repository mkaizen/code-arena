import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import { tierOf, MATCH_REACTIONS, type ServerEvent, type Language, type MatchStateView, type JudgeResult, type MatchActivity } from "@arena/shared";
import { api, type Problem } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import { loadDraft, saveDraft } from "../draft.js";
import { STARTERS, LANG_LABELS, MONACO_LANG } from "../starters.js";
import { starterFor } from "../problemStarters.js";
import { useRun } from "../hooks/useRun.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { RunResults } from "../components/RunResults.js";
import { SubmissionResult } from "../components/SubmissionResult.js";
import { sanitizeStatement } from "../sanitize.js";
import { verdictColor, verdictLabel, diffColor, RoundTimer, playerStatus, modeBrand } from "../matchUi.js";

function RatingDelta({ before, after }: { before: number | null; after: number | null }) {
  if (before == null || after == null) return null;
  const d = after - before;
  const color = d > 0 ? "var(--v-ac)" : d < 0 ? "var(--v-wa)" : "var(--txt-3)";
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color }}>
      {d >= 0 ? "+" : ""}{d} <span style={{ color: "var(--txt-3)" }}>→ {after}</span>
    </span>
  );
}

/**
 * The end-of-match rating reveal: the new rating counts up (or down) from the
 * old one, with the delta called out. This is the single most important number
 * of a ranked match, so it gets a real animation instead of tiny grey text.
 */
function RatingReveal({ before, after }: { before: number; after: number }) {
  const [val, setVal] = useState(before);
  useEffect(() => {
    if (before === after) { setVal(after); return; }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick, then settles
      setVal(Math.round(before + (after - before) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [before, after]);

  const d = after - before;
  const color = d > 0 ? "var(--v-ac)" : d < 0 ? "var(--v-wa)" : "var(--txt-2)";
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--txt-3)", fontWeight: 600 }}>RATING</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--txt)" }}>{val}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color, animation: "pop 0.3s ease-out" }}>
        {d > 0 ? "▲" : d < 0 ? "▼" : ""}{d >= 0 ? "+" : ""}{d}
      </span>
    </span>
  );
}

/** DUEL: round-win pips, one per round (● won, ○ not yet). */
function WinPips({ wins, total }: { wins: number; total: number }) {
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ color: i < wins ? "var(--v-ac)" : "var(--txt-3)" }}>{i < wins ? "●" : "○"}</span>
      ))}
    </span>
  );
}

interface ConsoleEntry {
  type: "submit" | "verdict" | "error" | "system";
  verdict?: string;
  result?: JudgeResult;
  message?: string;
}

export function BattleMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchStateView | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [lang, setLang] = useState<Language>("cpp");
  const [console_, setConsole] = useState<ConsoleEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const pendingSubmissions = useRef<Set<string>>(new Set());
  const prevRound = useRef<number | null>(null);
  const run = useRun(problem?.id);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<() => void>(() => {});
  const runRef = useRef<() => void>(() => {});
  const isMobile = useMediaQuery("(max-width: 820px)");
  const [mobileTab, setMobileTab] = useState<"problem" | "code" | "players">("problem");
  const [feed, setFeed] = useState<MatchActivity[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  // Emotes drifting up over the arena — each auto-expires so the list stays short.
  const [floats, setFloats] = useState<{ id: number; emoji: string; handle: string }[]>([]);
  const floatId = useRef(0);
  const [reactCooldown, setReactCooldown] = useState(false);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const [playAgainError, setPlayAgainError] = useState("");
  // Rematch (same-opponent, duels only): which players have offered so far.
  const [rematchOfferedBy, setRematchOfferedBy] = useState<string[]>([]);
  const [rematchDeclined, setRematchDeclined] = useState(false);
  const rematchNav = useRef(false);

  useEffect(() => {
    if (!id) return;
    // Reset per-match rematch state — navigating into a rematch keeps this
    // component mounted, only the :id changes.
    rematchNav.current = false;
    setRematchOfferedBy([]);
    setRematchDeclined(false);
    api.match(id).then(setMatch).catch((e: Error) => setLoadError(e.message));
  }, [id]);

  // Fetch full problem detail whenever the round's problem changes.
  useEffect(() => {
    if (!match?.problem) { setProblem(null); return; }
    api.problem(match.problem.slug).then(setProblem).catch(() => {});
  }, [match?.problem?.slug]);

  // Fresh console + a round banner every time the round advances.
  useEffect(() => {
    if (!match) return;
    if (prevRound.current !== null && prevRound.current !== match.round) {
      setConsole([]);
    }
    if (prevRound.current !== match.round && match.problem) {
      setConsole((c) => [...c, { type: "system", message: `Round ${match.round + 1}: ${match.problem!.title} (${match.problem!.difficulty})` }]);
    }
    prevRound.current = match.round;
  }, [match?.round]);

  const handleWsEvent = useCallback((ev: ServerEvent) => {
    run.onEvent(ev);
    if (ev.type === "match_state" && ev.match.id === id) {
      setMatch(ev.match);
    } else if (ev.type === "match_activity" && ev.matchId === id) {
      setFeed((f) => [ev.event, ...f].slice(0, 40));
    } else if (ev.type === "match_reaction" && ev.matchId === id) {
      const fid = ++floatId.current;
      const { emoji, handle } = ev.reaction;
      setFloats((f) => [...f, { id: fid, emoji, handle }].slice(-14));
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 2200);
    } else if (ev.type === "rematch" && ev.matchId === id) {
      setRematchOfferedBy(ev.offeredBy);
      setRematchDeclined(ev.declined);
    } else if (ev.type === "match_found" && ev.matchId !== id && user && ev.playerIds.includes(user.id) && !rematchNav.current) {
      // The rematch we agreed to has started — jump into it.
      rematchNav.current = true;
      navigate(`/battle/${ev.matchId}`);
    } else if (ev.type === "verdict" && pendingSubmissions.current.has(ev.submissionId)) {
      pendingSubmissions.current.delete(ev.submissionId);
      setConsole((c) => [...c, { type: "verdict", verdict: ev.result.verdict, result: ev.result }]);
      setFlash(ev.result.verdict === "ACCEPTED" ? "ok" : "bad");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1100);
    }
  }, [id, run.onEvent, user, navigate]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  useWs(handleWsEvent);

  function getSource(): string {
    if (!problem) return STARTERS[lang];
    return loadDraft(problem.slug, lang) ?? starterFor(problem.slug, lang);
  }
  const [source, setSourceState] = useState(getSource);
  useEffect(() => { setSourceState(getSource()); }, [problem?.slug, lang]);

  function setSource(val: string) {
    setSourceState(val);
    if (problem) saveDraft(problem.slug, lang, val);
  }

  function handleReset() {
    if (!problem) return;
    if (!window.confirm("Reset to the starter code? Your current code will be discarded.")) return;
    setSource(starterFor(problem.slug, lang));
  }

  function handleRun() {
    if (!problem) return;
    run.start(lang, source, showCustom && customInput.trim() ? customInput : undefined);
  }

  // "Play Again" closes the loop instead of dead-ending on the result screen.
  // Practice restarts immediately against fresh bots; a ranked match re-queues
  // for the same mode — landing you back in the same match if one fills at once,
  // otherwise in the battle lobby where match_found will pull you in.
  async function handlePlayAgain() {
    if (!match || playAgainBusy) return;
    setPlayAgainBusy(true);
    setPlayAgainError("");
    try {
      if (match.practice) {
        const { matchId } = await api.startPracticeMatch(match.mode);
        navigate(`/battle/${matchId}`);
      } else {
        const res = await api.queueForMatch(match.mode);
        if (res.matched && res.matchId) navigate(`/battle/${res.matchId}`);
        else navigate("/battle");
      }
    } catch (e) {
      setPlayAgainError((e as Error).message);
      setPlayAgainBusy(false);
    }
  }

  // Start a fresh AI duel. (Plain "Play Again" would send an AI-duel player
  // into a practice-vs-bots match, since AI duels are practice.)
  async function handleChallengeAgain() {
    if (!match || playAgainBusy) return;
    setPlayAgainBusy(true);
    setPlayAgainError("");
    try {
      const { matchId } = await api.startAiDuel();
      navigate(`/battle/${matchId}`);
    } catch (e) {
      setPlayAgainError((e as Error).message);
      setPlayAgainBusy(false);
    }
  }

  // Offer/accept a rematch of a finished duel. Optimistically show ourselves as
  // having offered; the server's `rematch` echo (and `match_found` once both
  // agree) drives the rest.
  function handleRematch() {
    if (!id || !user) return;
    setRematchDeclined(false);
    setRematchOfferedBy((o) => (o.includes(user.id) ? o : [...o, user.id]));
    api.offerRematch(id).catch(() => {});
  }

  function handleDeclineRematch() {
    if (!id) return;
    setRematchOfferedBy([]);
    api.declineRematch(id).catch(() => {});
  }

  // Fire an emote. The server echoes it back over the WS (to everyone, us
  // included), so the float is driven there — this just sends and throttles.
  function handleReact(emoji: string) {
    if (!id || reactCooldown) return;
    setReactCooldown(true);
    setTimeout(() => setReactCooldown(false), 700);
    api.matchReact(id, emoji).catch(() => {});
  }

  const myPlayer = match?.players.find((p) => p.userId === user?.id) ?? null;
  const canSubmit = !!user && !!match && match.status === "ACTIVE" && myPlayer?.status === "ALIVE" && !!problem;

  // Heartbeat while the match is live so we aren't judged as having abandoned
  // it. Fires immediately on mount, then every 10s (grace is 30s server-side).
  const amPlaying = !!id && match?.status === "ACTIVE" && myPlayer?.status === "ALIVE";
  useEffect(() => {
    if (!amPlaying || !id) return;
    let stopped = false;
    const beat = () => { if (!stopped) api.matchHeartbeat(id).catch(() => {}); };
    beat();
    const timer = setInterval(beat, 10_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [amPlaying, id]);

  async function handleSubmit() {
    if (!canSubmit || !problem || !id) return;
    setConsole((c) => [...c, { type: "submit", verdict: "PENDING", message: "Submitting…" }]);
    try {
      const r = await api.submit({ problemId: problem.id, matchId: id, language: lang, source });
      pendingSubmissions.current.add(r.id);
      setConsole((c) => [...c, { type: "submit", verdict: "JUDGING", message: `Submission ${r.id.slice(0, 8)} queued` }]);
    } catch (e) {
      setConsole((c) => [...c, { type: "error", message: (e as Error).message }]);
    }
  }

  // Keep the latest handlers reachable from Monaco's editor-scoped commands,
  // which capture their closure once at mount time.
  submitRef.current = handleSubmit;
  runRef.current = handleRun;

  const handleEditorMount: OnMount = (editor, m) => {
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => submitRef.current());
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.Enter, () => runRef.current());
  };

  // Follow the console as new submissions and verdicts arrive.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [console_, run.running, run.result]);

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--v-wa)" }}>
        {loadError}
      </div>
    );
  }
  if (!match) {
    return <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>Loading…</div>;
  }

  const eliminated = myPlayer?.status === "ELIMINATED";
  const finished = match.status === "FINISHED";
  const isDuel = match.mode === "DUEL";
  const isDraw = finished && match.players.filter((p) => p.placement === 1).length > 1;
  const opponent = isDuel ? match.players.find((p) => p.userId !== user?.id) ?? null : null;
  // Anyone still in the match — including eliminated players spectating the
  // rest of it — can cheer while it's live.
  const canReact = match.status === "ACTIVE" && !!myPlayer;

  // Rematch is the two-human duel rivalry loop. The opponent here must be a real
  // player (a bot duel just offers Play Again).
  const rematchEligible = finished && isDuel && !!myPlayer && !myPlayer.isBot
    && match.players.filter((p) => !p.isBot).length === 2;
  const iOfferedRematch = !!user && rematchOfferedBy.includes(user.id);
  const oppOfferedRematch = !!opponent && rematchOfferedBy.includes(opponent.userId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--ink)", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ height: 52, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0, gap: 16 }}>
        <Link to="/battle" style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--txt-3)", fontWeight: 400, fontSize: 13 }}>←</span>
          {modeBrand(match.mode)}
        </Link>
        <div style={{ width: 1, height: 24, background: "var(--line)" }} />
        <div style={{ flex: 1, fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14, color: "var(--txt)", display: "flex", alignItems: "center", gap: 12 }}>
          {finished ? "Match Finished" : `Round ${match.round + 1} / ${match.totalRounds}`}
          {match.practice && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--v-tle)", border: "1px solid var(--v-tle)", borderRadius: 4, padding: "1px 7px", letterSpacing: "0.04em" }}>
              PRACTICE
            </span>
          )}
          {isDuel && myPlayer && opponent && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--txt-2)" }}>
              <span style={{ color: "var(--v-ac)", fontWeight: 700 }}>{myPlayer.roundWins}</span>
              {" — "}
              <span style={{ color: "var(--v-wa)", fontWeight: 700 }}>{opponent.roundWins}</span>
            </span>
          )}
        </div>
        {/* AI duels have no visible clock — it's a straight race, and the AI
            usually solves fast, so a countdown just adds noise. (The backend
            keeps a generous deadline as a safety net.) */}
        {!finished && !match.aiDuel && <RoundTimer endsAt={match.roundEndsAt} />}
      </header>

      {finished && match.aiDuel && (
        <AiDuelResult
          won={myPlayer?.placement === 1 && !isDraw}
          draw={isDraw}
          opponentName={opponent?.handle ?? "the AI"}
          matchId={id}
          onChallengeAgain={handleChallengeAgain}
          busy={playAgainBusy}
          error={playAgainError}
        />
      )}
      {finished && !match.aiDuel && (
        <div style={{ padding: "10px 20px", background: "rgba(63,185,80,0.08)", borderBottom: "1px solid rgba(63,185,80,0.2)", color: "var(--v-ac)", fontSize: 13, fontWeight: 600, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <span>
              {isDuel
                ? isDraw
                  ? "🤝 The duel ended in a draw."
                  : myPlayer?.placement === 1
                    ? "🏆 You won the duel!"
                    : `You lost the duel${opponent ? ` to ${opponent.handle}` : ""}.`
                : myPlayer?.placement === 1
                  ? "🏆 You won the match!"
                  : myPlayer?.placement
                    ? `Match over — you placed #${myPlayer.placement}`
                    : "Match over"}
            </span>
            {/* The rating swing — only on rated matches (practice is unrated). */}
            {myPlayer?.ratingBefore != null && myPlayer?.ratingAfter != null && (
              <RatingReveal before={myPlayer.ratingBefore} after={myPlayer.ratingAfter} />
            )}
          </div>

          {/* Rematch — same two players, the "I'll get you this time" loop. */}
          {rematchEligible && opponent && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {oppOfferedRematch && !iOfferedRematch ? (
                <>
                  <span style={{ color: "var(--v-tle)" }}>🔥 {opponent.handle} wants a rematch!</span>
                  <button
                    onClick={handleRematch}
                    style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "#06210C", background: "var(--v-ac)", padding: "4px 14px", borderRadius: 6, border: "none", cursor: "pointer" }}
                  >
                    Accept rematch
                  </button>
                  <button
                    onClick={handleDeclineRematch}
                    style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--txt-2)", background: "transparent", padding: "3px 12px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer" }}
                  >
                    Decline
                  </button>
                </>
              ) : iOfferedRematch ? (
                <>
                  <span style={{ color: "var(--txt-2)" }}>Waiting for {opponent.handle} to accept…</span>
                  <button
                    onClick={handleDeclineRematch}
                    style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--txt-2)", background: "transparent", padding: "3px 12px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRematch}
                    style={{ fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "#06210C", background: "var(--v-ac)", padding: "4px 14px", borderRadius: 6, border: "none", cursor: "pointer" }}
                  >
                    ↻ Rematch {opponent.handle}
                  </button>
                  {rematchDeclined && <span style={{ color: "var(--txt-3)", fontSize: 12 }}>Rematch declined.</span>}
                </>
              )}
            </div>
          )}

          <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {myPlayer && (
              <button
                onClick={handlePlayAgain}
                disabled={playAgainBusy}
                style={{
                  fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "#06210C",
                  background: "var(--v-ac)", padding: "4px 14px", borderRadius: 6, border: "none",
                  cursor: playAgainBusy ? "not-allowed" : "pointer", opacity: playAgainBusy ? 0.7 : 1,
                }}
              >
                {playAgainBusy ? "Starting…" : match.practice ? "↻ Play Again" : "↻ New Match"}
              </button>
            )}
            {id && (
              <Link
                to={`/replay/${id}`}
                style={{
                  fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--v-ac)",
                  background: "transparent", border: "1px solid var(--v-ac)", padding: "3px 12px", borderRadius: 6, textDecoration: "none",
                }}
              >
                Watch Replay
              </Link>
            )}
            {id && (
              <Link
                to={`/share/${id}`}
                style={{
                  fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--txt)",
                  background: "var(--panel-2)", border: "1px solid var(--line)", padding: "3px 12px", borderRadius: 6, textDecoration: "none",
                }}
              >
                Share Result
              </Link>
            )}
          </div>
          {playAgainError && <span style={{ color: "var(--v-wa)", fontSize: 12, fontWeight: 500 }}>{playAgainError}</span>}
        </div>
      )}
      {!finished && eliminated && (
        <div style={{ padding: "10px 20px", background: "rgba(255,92,92,0.08)", borderBottom: "1px solid rgba(255,92,92,0.2)", color: "var(--v-wa)", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
          You were eliminated in Round {(myPlayer?.eliminatedRound ?? 0) + 1} — spectating.
        </div>
      )}
      {!finished && !eliminated && match.status === "ACTIVE" && myPlayer?.solvedCurrentRound && (
        <div style={{ padding: "10px 20px", background: "rgba(63,185,80,0.08)", borderBottom: "1px solid rgba(63,185,80,0.2)", color: "var(--v-ac)", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
          Solved ✓ — waiting for the round to end. You can keep refining your solution.
        </div>
      )}

      {/* Mobile-only tab switcher between the problem, editor and players */}
      {isMobile && (
        <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
          {(["problem", "code", "players"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              style={{
                flex: 1, padding: "10px 0", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13,
                background: mobileTab === t ? "var(--panel-2)" : "transparent",
                color: mobileTab === t ? "var(--txt)" : "var(--txt-3)",
                border: "none", borderBottom: `2px solid ${mobileTab === t ? "var(--v-ac)" : "transparent"}`,
                cursor: "pointer",
              }}
            >
              {t === "problem" ? "Problem" : t === "code" ? "Code" : `Players (${match.players.length})`}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
        {/* Center: problem + editor */}
        <div
          style={{
            flex: 1, display: isMobile && mobileTab === "players" ? "none" : "flex",
            flexDirection: "column", minWidth: 0, minHeight: 0,
          }}
        >
          {problem ? (
            <>
              <div
                style={{
                  flex: isMobile ? 1 : "0 0 38%", overflow: "auto", borderBottom: "1px solid var(--line)", padding: "16px 20px",
                  display: isMobile && mobileTab !== "problem" ? "none" : "block",
                  minHeight: isMobile ? 0 : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <h2 style={{ fontFamily: "var(--disp)", fontSize: 18, fontWeight: 700, color: "var(--txt)" }}>{problem.title}</h2>
                  <span style={{ fontSize: 12, fontWeight: 700, color: diffColor(problem.difficulty) }}>
                    {problem.difficulty === "easy" ? "Easy" : problem.difficulty === "med" ? "Medium" : "Hard"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>{problem.timeMs}ms · {Math.round(problem.memoryKb / 1024)}MB</span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: sanitizeStatement(problem.statement) }} style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }} />
                {problem.samples.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {problem.samples.map((s) => (
                      <div key={s.ordinal} style={{ display: "contents" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Input {s.ordinal}</div>
                          <pre style={{ fontFamily: "var(--mono)", fontSize: 12, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", color: "var(--txt)", overflow: "auto", margin: 0, whiteSpace: "pre-wrap" }}>{s.input}</pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Output {s.ordinal}</div>
                          <pre style={{ fontFamily: "var(--mono)", fontSize: 12, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", color: "var(--txt)", overflow: "auto", margin: 0, whiteSpace: "pre-wrap" }}>{s.output}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: isMobile && mobileTab !== "code" ? "none" : "flex", alignItems: "center", gap: 8, rowGap: 6, flexWrap: "wrap", padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Language)}
                  style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", fontSize: 12, padding: "4px 8px", cursor: "pointer" }}
                >
                  {(Object.entries(LANG_LABELS) as [Language, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--txt-3)", cursor: "pointer" }}>
                  <input type="checkbox" checked={showCustom} onChange={(e) => setShowCustom(e.target.checked)} />
                  Custom input
                </label>
                <div style={{ flex: 1 }} />
                <button
                  onClick={handleReset}
                  title="Reset to starter code"
                  style={{ background: "transparent", color: "var(--txt-2)", fontWeight: 500, fontSize: 12, padding: "5px 12px", border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer", fontFamily: "var(--disp)" }}
                >
                  Reset
                </button>
                <button
                  onClick={handleRun}
                  disabled={run.running || !problem}
                  title="Run against sample cases (⌘/Ctrl+Shift+Enter)"
                  style={{ background: "var(--panel-2)", color: "var(--txt)", fontWeight: 600, fontSize: 12, padding: "5px 14px", border: "1px solid var(--line)", borderRadius: 6, cursor: run.running ? "not-allowed" : "pointer", fontFamily: "var(--disp)", opacity: run.running ? 0.7 : 1 }}
                >
                  {run.running ? "Running…" : "▶ Run"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  title={canSubmit ? "Submit for judging (⌘/Ctrl+Enter)" : finished ? "The match is over" : eliminated ? "You've been eliminated" : "You can't submit right now"}
                  style={{
                    background: canSubmit ? "var(--v-ac)" : "var(--panel-2)", color: canSubmit ? "#06210C" : "var(--txt-3)",
                    fontWeight: 700, fontSize: 12, padding: "5px 14px", border: "none", borderRadius: 6,
                    cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "var(--disp)",
                  }}
                >
                  Submit
                </button>
              </div>

              {showCustom && (isMobile ? mobileTab === "code" : true) && (
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Custom stdin for ▶ Run (leave blank to use the samples)…"
                    rows={2}
                    style={{ width: "100%", boxSizing: "border-box", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", fontFamily: "var(--mono)", fontSize: 12, padding: "6px 8px", resize: "vertical" }}
                  />
                </div>
              )}

              <div
                style={{
                  flex: 1, minHeight: 0, transition: "box-shadow 0.15s ease",
                  display: isMobile && mobileTab !== "code" ? "none" : "block",
                  boxShadow: flash === "ok" ? "inset 0 0 0 2px var(--v-ac)" : flash === "bad" ? "inset 0 0 0 2px var(--v-wa)" : "none",
                }}
              >
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={MONACO_LANG[lang]}
                  value={source}
                  onChange={(v) => setSource(v ?? "")}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbersMinChars: 3,
                    padding: { top: 8, bottom: 8 }, readOnly: !canSubmit, automaticLayout: true,
                  }}
                />
              </div>

              <div ref={consoleRef} style={{ display: isMobile && mobileTab !== "code" ? "none" : "block", height: 130, borderTop: "1px solid var(--line)", background: "var(--panel)", overflow: "auto", padding: "8px 12px", flexShrink: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--txt-3)", marginBottom: 6, fontWeight: 600 }}>CONSOLE</div>
                {(run.running || run.result) && (
                  <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--line-soft)" }}>
                    <RunResults result={run.result} running={run.running} />
                  </div>
                )}
                {console_.length === 0 && !run.result && !run.running && <div style={{ color: "var(--txt-3)", fontSize: 12 }}>No submissions yet. ▶ Run the samples (⌘/Ctrl+Shift+Enter) or Submit (⌘/Ctrl+Enter).</div>}
                {console_.map((entry, i) => (
                  <div key={i} style={{ marginBottom: 4, fontFamily: "var(--mono)", fontSize: 12 }}>
                    {entry.type === "error" ? (
                      <span style={{ color: "var(--v-wa)" }}>Error: {entry.message}</span>
                    ) : entry.type === "system" ? (
                      <span style={{ color: "var(--v-judge)" }}>{entry.message}</span>
                    ) : entry.result ? (
                      <SubmissionResult result={entry.result} />
                    ) : entry.verdict ? (
                      <span>
                        <span style={{ color: verdictColor(entry.verdict), fontWeight: 700 }}>{verdictLabel(entry.verdict)}</span>
                        {entry.message && <span style={{ color: "var(--txt-3)" }}> · {entry.message}</span>}
                      </span>
                    ) : (
                      <span style={{ color: "var(--txt-3)" }}>{entry.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>
              {finished ? "The match has ended." : "Loading problem…"}
            </div>
          )}
        </div>

        {/* Right: players */}
        <aside
          style={{
            width: isMobile ? "auto" : 260, flexShrink: 0,
            flex: isMobile ? 1 : undefined, minHeight: isMobile ? 0 : undefined,
            borderLeft: isMobile ? "none" : "1px solid var(--line)", background: "var(--panel)",
            display: isMobile && mobileTab !== "players" ? "none" : "flex",
            flexDirection: "column", overflow: "auto",
          }}
        >
          {canReact && (
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              {MATCH_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  disabled={reactCooldown}
                  title={`React ${emoji}`}
                  aria-label={`React ${emoji}`}
                  style={{
                    background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8,
                    fontSize: 17, lineHeight: 1, padding: "5px 8px", cursor: reactCooldown ? "default" : "pointer",
                    opacity: reactCooldown ? 0.45 : 1, transition: "opacity 0.15s ease, transform 0.1s ease",
                  }}
                  onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.88)"; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--line-soft)", fontSize: 10, letterSpacing: "0.1em", color: "var(--txt-3)", fontWeight: 600 }}>
            PLAYERS
          </div>
          {match.players.map((p) => {
            const tier = tierOf(p.rating);
            const st = playerStatus(p, match);
            const isMe = p.userId === user?.id;
            return (
              <div
                key={p.userId}
                style={{
                  display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px",
                  borderBottom: "1px solid var(--line-soft)",
                  background: isMe ? "var(--panel-2)" : "transparent",
                  opacity: p.status === "ELIMINATED" ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {p.isBot ? (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: tier.color }}>🤖 {p.handle}</span>
                  ) : (
                    <Link to={`/u/${encodeURIComponent(p.handle)}`} style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: tier.color, textDecoration: "none" }}>{p.handle}</Link>
                  )}
                  {isMe && <span style={{ fontSize: 10, color: "var(--txt-3)" }}>(you)</span>}
                  {isDuel && <span style={{ marginLeft: "auto" }}><WinPips wins={p.roundWins} total={match.totalRounds} /></span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                  {finished && <RatingDelta before={p.ratingBefore} after={p.ratingAfter} />}
                </div>
              </div>
            );
          })}

          {/* Live submission feed — every player's attempts, verdict only. */}
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

      {/* Floating emotes — a fixed layer so they drift over the arena without
          disturbing layout, and never intercept clicks. */}
      <div style={{ position: "fixed", right: 24, bottom: 24, width: 180, height: 240, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}>
        {floats.map((fl) => {
          const isMine = !!myPlayer && fl.handle === myPlayer.handle;
          return (
            <div
              key={fl.id}
              style={{
                position: "absolute", bottom: 0, right: (fl.id % 5) * 30, display: "flex", alignItems: "center", gap: 6,
                animation: "floatUp 2.2s ease-out forwards", whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: isMine ? "var(--v-ac)" : "var(--txt-2)", textShadow: "0 1px 3px var(--ink)" }}>
                {fl.handle}
              </span>
              <span style={{ fontSize: 26, lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>{fl.emoji}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The end-of-duel panel for a "Challenge the AI" match — violet-themed, with a
// rematch, the replay (which reveals the AI's actual code), and a share link.
function AiDuelResult({ won, draw, opponentName, matchId, onChallengeAgain, busy, error }: {
  won: boolean;
  draw: boolean;
  opponentName: string;
  matchId?: string;
  onChallengeAgain: () => void;
  busy: boolean;
  error: string;
}) {
  const AI = "#a371f7";
  const headline = draw ? "🤝 Draw against the AI" : won ? "🏆 You beat the AI!" : "🤖 The AI won this one";
  const headColor = draw ? "var(--txt)" : won ? "var(--v-ac)" : "var(--v-wa)";
  const tint = draw ? "rgba(163,113,247,0.10)" : won ? "rgba(63,185,80,0.12)" : "rgba(255,92,92,0.10)";
  const border = draw ? "rgba(163,113,247,0.35)" : won ? "rgba(63,185,80,0.3)" : "rgba(255,92,92,0.3)";
  const linkBase = { fontFamily: "var(--disp)", fontSize: 13, fontWeight: 700, padding: "6px 16px", borderRadius: 8, textDecoration: "none" } as const;
  return (
    <div style={{ padding: "16px 20px", background: `radial-gradient(140% 220% at 0% 0%, rgba(163,113,247,0.16), transparent 60%), ${tint}`, borderBottom: `1px solid ${border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22, color: headColor }}>{headline}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)" }}>vs 🤖 {opponentName}</div>
      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <button
          onClick={onChallengeAgain}
          disabled={busy}
          style={{ fontFamily: "var(--disp)", fontSize: 13, fontWeight: 700, color: "#fff", background: AI, padding: "7px 18px", borderRadius: 8, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Starting…" : "⚔ Challenge again"}
        </button>
        {matchId && (
          <Link to={`/replay/${matchId}`} style={{ ...linkBase, color: AI, background: "transparent", border: `1px solid ${AI}` }}>
            Watch replay →
          </Link>
        )}
        {matchId && (
          <Link to={`/share/${matchId}`} style={{ ...linkBase, color: "var(--txt-2)", background: "var(--panel-2)", border: "1px solid var(--line)" }}>
            Share
          </Link>
        )}
      </div>
      {error && <span style={{ color: "var(--v-wa)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
