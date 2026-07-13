import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { tierOf, type ServerEvent, type Language, type MatchPlayerView, type MatchStateView, type JudgeResult } from "@arena/shared";
import { api, type Problem } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import { loadDraft, saveDraft } from "../draft.js";
import { STARTERS, LANG_LABELS, MONACO_LANG } from "../starters.js";
import { starterFor } from "../problemStarters.js";
import { useRun } from "../hooks/useRun.js";
import { RunResults } from "../components/RunResults.js";
import { sanitizeStatement } from "../sanitize.js";

function verdictColor(verdict: string): string {
  if (verdict === "ACCEPTED") return "var(--v-ac)";
  if (["WRONG_ANSWER", "RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"].includes(verdict)) return "var(--v-wa)";
  if (verdict === "TIME_LIMIT_EXCEEDED") return "var(--v-tle)";
  if (verdict === "COMPILATION_ERROR") return "var(--v-ce)";
  if (["PENDING", "JUDGING"].includes(verdict)) return "var(--v-judge)";
  return "var(--txt-2)";
}

function verdictLabel(verdict: string): string {
  const map: Record<string, string> = {
    ACCEPTED: "Accepted", WRONG_ANSWER: "Wrong Answer", TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
    MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded", RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error", INTERNAL_ERROR: "Internal Error",
    PENDING: "Pending", JUDGING: "Judging…",
  };
  return map[verdict] ?? verdict;
}

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  return "var(--v-wa)";
}

function RoundTimer({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const deadline = new Date(endsAt).getTime();
    function update() { setRemaining(Math.max(0, deadline - Date.now())); }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const critical = remaining < 30_000;
  const warn = remaining < 60_000;
  return (
    <div
      style={{
        fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700,
        color: critical ? "var(--v-wa)" : warn ? "var(--v-tle)" : "var(--txt)",
        animation: critical ? "flash 1s step-start infinite" : undefined,
      }}
    >
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}

function playerStatus(p: MatchPlayerView, match: MatchStateView): { label: string; color: string } {
  const isDraw = match.status === "FINISHED" && match.players.filter((q) => q.placement === 1).length > 1;
  if (match.status === "FINISHED" && p.placement != null) {
    if (p.placement === 1 && isDraw) return { label: "🤝 Draw", color: "var(--v-tle)" };
    return { label: p.placement === 1 ? "🏆 Winner" : `#${p.placement}`, color: p.placement === 1 ? "var(--v-ac)" : "var(--txt-2)" };
  }
  if (p.forfeited) return { label: "Forfeited · left", color: "var(--v-wa)" };
  if (p.status === "ELIMINATED") return { label: `Eliminated · R${(p.eliminatedRound ?? 0) + 1}`, color: "var(--v-wa)" };
  if (p.solvedCurrentRound) return { label: "Solved ✓", color: "var(--v-ac)" };
  return { label: "Racing…", color: "var(--txt-3)" };
}

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

  useEffect(() => {
    if (!id) return;
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
    } else if (ev.type === "verdict" && pendingSubmissions.current.has(ev.submissionId)) {
      pendingSubmissions.current.delete(ev.submissionId);
      setConsole((c) => [...c, { type: "verdict", verdict: ev.result.verdict, result: ev.result }]);
    }
  }, [id, run.onEvent]);

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
    run.start(lang, source);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--ink)", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ height: 52, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0, gap: 16 }}>
        <Link to="/battle" style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--txt-3)", fontWeight: 400, fontSize: 13 }}>←</span>
          {isDuel ? <>1v1&nbsp;<span style={{ color: "var(--v-ac)" }}>Duel</span></> : <>Battle<span style={{ color: "var(--v-ac)" }}>Royale</span></>}
        </Link>
        <div style={{ width: 1, height: 24, background: "var(--line)" }} />
        <div style={{ flex: 1, fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14, color: "var(--txt)", display: "flex", alignItems: "center", gap: 12 }}>
          {finished ? "Match Finished" : `Round ${match.round + 1} / ${match.totalRounds}`}
          {isDuel && myPlayer && opponent && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--txt-2)" }}>
              <span style={{ color: "var(--v-ac)", fontWeight: 700 }}>{myPlayer.roundWins}</span>
              {" — "}
              <span style={{ color: "var(--v-wa)", fontWeight: 700 }}>{opponent.roundWins}</span>
            </span>
          )}
        </div>
        {!finished && <RoundTimer endsAt={match.roundEndsAt} />}
      </header>

      {finished && (
        <div style={{ padding: "10px 20px", background: "rgba(63,185,80,0.08)", borderBottom: "1px solid rgba(63,185,80,0.2)", color: "var(--v-ac)", fontSize: 13, fontWeight: 600, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
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
          {id && (
            <span style={{ display: "inline-flex", gap: 8 }}>
              <Link
                to={`/replay/${id}`}
                style={{
                  fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "var(--v-ac)",
                  background: "transparent", border: "1px solid var(--v-ac)", padding: "3px 12px", borderRadius: 6, textDecoration: "none",
                }}
              >
                Watch Replay
              </Link>
              <Link
                to={`/share/${id}`}
                style={{
                  fontFamily: "var(--disp)", fontSize: 12, fontWeight: 700, color: "#06210C",
                  background: "var(--v-ac)", padding: "4px 12px", borderRadius: 6, textDecoration: "none",
                }}
              >
                Share Result
              </Link>
            </span>
          )}
        </div>
      )}
      {!finished && eliminated && (
        <div style={{ padding: "10px 20px", background: "rgba(255,92,92,0.08)", borderBottom: "1px solid rgba(255,92,92,0.2)", color: "var(--v-wa)", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
          You were eliminated in Round {(myPlayer?.eliminatedRound ?? 0) + 1} — spectating.
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Center: problem + editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {problem ? (
            <>
              <div style={{ flex: "0 0 38%", overflow: "auto", borderBottom: "1px solid var(--line)", padding: "16px 20px" }}>
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

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Language)}
                  style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", fontSize: 12, padding: "4px 8px", cursor: "pointer" }}
                >
                  {(Object.entries(LANG_LABELS) as [Language, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
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
                  title="Run against sample cases"
                  style={{ background: "var(--panel-2)", color: "var(--txt)", fontWeight: 600, fontSize: 12, padding: "5px 14px", border: "1px solid var(--line)", borderRadius: 6, cursor: run.running ? "not-allowed" : "pointer", fontFamily: "var(--disp)", opacity: run.running ? 0.7 : 1 }}
                >
                  {run.running ? "Running…" : "▶ Run"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    background: canSubmit ? "var(--v-ac)" : "var(--panel-2)", color: canSubmit ? "#06210C" : "var(--txt-3)",
                    fontWeight: 700, fontSize: 12, padding: "5px 14px", border: "none", borderRadius: 6,
                    cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "var(--disp)",
                  }}
                >
                  Submit
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={MONACO_LANG[lang]}
                  value={source}
                  onChange={(v) => setSource(v ?? "")}
                  options={{
                    fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbersMinChars: 3,
                    padding: { top: 8, bottom: 8 }, readOnly: !canSubmit,
                  }}
                />
              </div>

              <div style={{ height: 130, borderTop: "1px solid var(--line)", background: "var(--panel)", overflow: "auto", padding: "8px 12px", flexShrink: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--txt-3)", marginBottom: 6, fontWeight: 600 }}>CONSOLE</div>
                {(run.running || run.result) && (
                  <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--line-soft)" }}>
                    <RunResults result={run.result} running={run.running} />
                  </div>
                )}
                {console_.length === 0 && !run.result && !run.running && <div style={{ color: "var(--txt-3)", fontSize: 12 }}>No submissions yet. ▶ Run tests against the samples.</div>}
                {console_.map((entry, i) => (
                  <div key={i} style={{ marginBottom: 4, fontFamily: "var(--mono)", fontSize: 12 }}>
                    {entry.type === "error" ? (
                      <span style={{ color: "var(--v-wa)" }}>Error: {entry.message}</span>
                    ) : entry.type === "system" ? (
                      <span style={{ color: "var(--v-judge)" }}>{entry.message}</span>
                    ) : entry.verdict ? (
                      <span>
                        <span style={{ color: verdictColor(entry.verdict), fontWeight: 700 }}>{verdictLabel(entry.verdict)}</span>
                        {entry.result && entry.result.maxTimeMs > 0 && <span style={{ color: "var(--txt-3)" }}> · {entry.result.maxTimeMs}ms</span>}
                        {entry.result?.message && <div style={{ color: "var(--txt-2)", marginTop: 3, fontSize: 11, whiteSpace: "pre-wrap" }}>{entry.result.message}</div>}
                        {entry.result?.failedStdout && <pre style={{ color: "var(--txt-2)", marginTop: 4, fontSize: 11, whiteSpace: "pre-wrap" }}>Your output:{"\n"}{entry.result.failedStdout}</pre>}
                        {entry.result?.failedStderr && <pre style={{ color: "var(--v-tle)", marginTop: 4, fontSize: 11, whiteSpace: "pre-wrap" }}>Stderr:{"\n"}{entry.result.failedStderr}</pre>}
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
        <aside style={{ width: 260, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", overflow: "auto" }}>
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
                  <Link to={`/u/${encodeURIComponent(p.handle)}`} style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: tier.color, textDecoration: "none" }}>{p.handle}</Link>
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
        </aside>
      </div>
    </div>
  );
}
