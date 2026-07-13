import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import type { Language, ServerEvent, GhostView, GhostEvent, GhostFinishResponse } from "@arena/shared";
import { api, type Problem } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import { useRun } from "../hooks/useRun.js";
import { RunResults } from "../components/RunResults.js";
import { loadDraft, saveDraft } from "../draft.js";
import { STARTERS, LANG_LABELS, MONACO_LANG } from "../starters.js";
import { starterFor } from "../problemStarters.js";
import { sanitizeStatement } from "../sanitize.js";
import { TopBar } from "../components/TopBar.js";

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  return "var(--v-wa)";
}

/** The ghost's pace bar: fills 0→100% over its solve time, with WA pips. */
function GhostBar({ ghost, elapsedMs }: { ghost: GhostView; elapsedMs: number }) {
  const pct = Math.min(100, (elapsedMs / ghost.totalMs) * 100);
  const done = elapsedMs >= ghost.totalMs;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "var(--txt-2)", fontFamily: "var(--mono)" }}>👻 {ghost.handle}</span>
        <span style={{ color: done ? "var(--v-wa)" : "var(--txt-3)", fontFamily: "var(--mono)" }}>
          {done ? `solved at ${clock(ghost.totalMs)} — catch up!` : `will solve at ${clock(ghost.totalMs)}`}
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: done ? "var(--v-wa)" : "var(--v-tle)", transition: "width 0.1s linear" }} />
        {ghost.events.filter((e) => e.verdict !== "ACCEPTED").map((e, i) => (
          <div key={i} title={`WA at ${clock(e.offsetMs)}`} style={{ position: "absolute", top: 0, left: `${Math.min(100, (e.offsetMs / ghost.totalMs) * 100)}%`, width: 2, height: "100%", background: "var(--v-wa)", opacity: 0.7 }} />
        ))}
      </div>
    </div>
  );
}

export function RacePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [phase, setPhase] = useState<"ready" | "racing" | "done">("ready");
  const [raceId, setRaceId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<GhostView | null>(null);
  const [lang, setLang] = useState<Language>("cpp");
  const [source, setSource] = useState(STARTERS.cpp);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<GhostFinishResponse | null>(null);
  const [error, setError] = useState("");

  const startRef = useRef(0);
  const eventsRef = useRef<GhostEvent[]>([]);
  const pendingId = useRef<string | null>(null);
  const finishing = useRef(false);
  const run = useRun(problem?.id);

  useEffect(() => {
    if (!slug) return;
    api.problem(slug).then(setProblem).catch((e: Error) => setError(e.message));
  }, [slug]);

  useEffect(() => {
    if (!problem) return;
    setSource(loadDraft(problem.slug, lang) ?? starterFor(problem.slug, lang));
  }, [problem, lang]);

  // Tick the race clock.
  useEffect(() => {
    if (phase !== "racing") return;
    const t = setInterval(() => setElapsedMs(Date.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [phase]);

  const doFinish = useCallback(async () => {
    if (!raceId || finishing.current) return;
    finishing.current = true;
    try {
      const r = await api.ghostFinish(raceId, eventsRef.current);
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [raceId]);

  useWs(useCallback((ev: ServerEvent) => {
    run.onEvent(ev);
    if (ev.type === "verdict" && ev.submissionId === pendingId.current) {
      pendingId.current = null;
      eventsRef.current.push({ offsetMs: Date.now() - startRef.current, verdict: ev.result.verdict });
      if (ev.result.verdict === "ACCEPTED") doFinish();
    }
  }, [run.onEvent, doFinish]));

  async function startRace() {
    if (!problem) return;
    setError("");
    try {
      const { raceId: id, ghost: g } = await api.ghostStart(problem.id);
      setRaceId(id);
      setGhost(g);
      eventsRef.current = [];
      startRef.current = Date.now();
      setElapsedMs(0);
      setPhase("racing");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setSrc(v: string) {
    setSource(v);
    if (problem) saveDraft(problem.slug, lang, v);
  }

  async function handleSubmit() {
    if (!problem || phase !== "racing") return;
    try {
      const r = await api.submit({ problemId: problem.id, language: lang, source });
      pendingId.current = r.id;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--txt-2)" }}>
          <div style={{ fontSize: 34 }}>👻</div>
          <p>Sign in to race a ghost.</p>
          <Link to="/login" style={{ background: "var(--v-ac)", color: "#06210C", fontWeight: 700, padding: "10px 20px", borderRadius: 8, textDecoration: "none", fontFamily: "var(--disp)" }}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--ink)", overflow: "hidden" }}>
      <TopBar />

      {/* Race status bar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, color: phase === "done" ? (result?.beat ? "var(--v-ac)" : "var(--txt)") : "var(--txt)" }}>
          {clock(phase === "done" && result ? result.totalMs : elapsedMs)}
        </div>
        <div style={{ flex: 1, maxWidth: 420 }}>
          {ghost ? <GhostBar ghost={ghost} elapsedMs={phase === "done" && result ? result.totalMs : elapsedMs} />
            : <span style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>No ghost yet — you're setting the pace 🥇</span>}
        </div>
        <div style={{ flex: 1 }} />
        {phase === "ready" && <button onClick={startRace} style={btn("var(--v-ac)", "#06210C")}>▶ Start Race</button>}
        {phase === "racing" && (
          <>
            <button onClick={() => { if (problem) run.start(lang, source); }} disabled={run.running} style={btn("var(--panel-2)", "var(--txt)")}>{run.running ? "Running…" : "▶ Run"}</button>
            <button onClick={handleSubmit} style={btn("var(--v-ac)", "#06210C")}>Submit</button>
          </>
        )}
      </div>

      {error && <div style={{ padding: "8px 20px", color: "var(--v-wa)", fontSize: 13, background: "rgba(255,92,92,0.08)" }}>{error}</div>}

      {phase === "done" && result && (
        <div style={{ padding: "14px 20px", background: result.beat ? "rgba(63,185,80,0.1)" : "rgba(255,92,92,0.08)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: result.beat === false ? "var(--v-wa)" : "var(--v-ac)" }}>
            {result.beat === null ? `🥇 Solved in ${clock(result.totalMs)} — you set the pace!`
              : result.beat ? `🏆 You beat ${ghost?.handle} — ${clock(result.totalMs)} vs ${clock(ghost!.totalMs)}!`
              : `👻 ${ghost?.handle} was faster — ${clock(result.totalMs)} vs ${clock(ghost!.totalMs)}. Rematch?`}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setPhase("ready"); setResult(null); setGhost(null); setRaceId(null); finishing.current = false; }} style={btn("var(--v-ac)", "#06210C")}>Race again</button>
          <Link to={`/problems/${problem?.slug}`} style={{ ...btn("var(--panel-2)", "var(--txt)"), textDecoration: "none", display: "inline-block" }}>Practice mode</Link>
        </div>
      )}

      {problem ? (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
          {/* Statement */}
          <div style={{ borderRight: "1px solid var(--line)", overflow: "auto", padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h1 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 700, color: "var(--txt)", margin: 0 }}>{problem.title}</h1>
              <span style={{ fontSize: 12, fontWeight: 700, color: diffColor(problem.difficulty) }}>
                {problem.difficulty === "easy" ? "Easy" : problem.difficulty === "med" ? "Medium" : "Hard"}
              </span>
            </div>
            <div dangerouslySetInnerHTML={{ __html: sanitizeStatement(problem.statement) }} style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.8, marginBottom: 16, filter: phase === "ready" ? "blur(5px)" : "none", userSelect: phase === "ready" ? "none" : "auto" }} />
            {phase === "ready" && <div style={{ color: "var(--txt-3)", fontSize: 13 }}>Hit <strong>Start Race</strong> to reveal the problem and start the clock.</div>}
            {phase !== "ready" && problem.samples.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {problem.samples.map((s) => (
                  <div key={s.ordinal} style={{ display: "contents" }}>
                    <div><div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Input {s.ordinal}</div><pre style={preStyle}>{s.input}</pre></div>
                    <div><div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Output {s.ordinal}</div><pre style={preStyle}>{s.output}</pre></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor + run console */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
              <select value={lang} onChange={(e) => setLang(e.target.value as Language)} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", fontSize: 12, padding: "4px 8px" }}>
                {(Object.entries(LANG_LABELS) as [Language, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor height="100%" theme="vs-dark" language={MONACO_LANG[lang]} value={source} onChange={(v) => setSrc(v ?? "")}
                options={{ fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 8, bottom: 8 }, readOnly: phase !== "racing" }} />
            </div>
            <div style={{ height: 150, borderTop: "1px solid var(--line)", background: "var(--panel)", overflow: "auto", padding: "8px 12px", flexShrink: 0 }}>
              {run.result || run.running ? <RunResults result={run.result} running={run.running} />
                : <div style={{ color: "var(--txt-3)", fontSize: 12 }}>Run tests against the samples, then Submit to stop the clock.</div>}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>Loading…</div>
      )}
    </div>
  );
}

const preStyle: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: 12, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", color: "var(--txt)", overflow: "auto", margin: 0, whiteSpace: "pre-wrap" };
function btn(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontWeight: 700, fontSize: 12, padding: "6px 16px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--disp)" };
}
