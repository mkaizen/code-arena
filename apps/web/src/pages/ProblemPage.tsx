import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import { type Language } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api, type Problem, type Submission } from "../api.js";
import type { ProblemLeaderboard } from "@arena/shared";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import { loadDraft, saveDraft } from "../draft.js";
import { STARTERS, LANG_LABELS, MONACO_LANG } from "../starters.js";
import { starterFor } from "../problemStarters.js";
import { useRun } from "../hooks/useRun.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { RunResults } from "../components/RunResults.js";
import { sanitizeStatement } from "../sanitize.js";
import { useSeo, metaFromHtml } from "../hooks/useSeo.js";
import type { ServerEvent } from "@arena/shared";

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
    ACCEPTED: "Accepted",
    WRONG_ANSWER: "Wrong Answer",
    TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
    MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
    RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error",
    INTERNAL_ERROR: "Internal Error",
    PENDING: "Pending",
    JUDGING: "Judging…",
  };
  return map[verdict] ?? verdict;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function LeaderColumn({ title, rows, me }: { title: string; rows: { handle: string; metric: string; language: Language }[]; me?: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 11, fontWeight: 700, color: "var(--txt-2)", fontFamily: "var(--disp)" }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ color: "var(--txt-3)", fontSize: 12, padding: "10px 12px" }}>No solves yet.</div>
      ) : rows.map((r, i) => {
        const mine = r.handle === me;
        return (
          <div key={`${r.handle}-${i}`} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 6, alignItems: "center", padding: "6px 12px", borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 12, background: mine ? "var(--panel-2)" : "transparent" }}>
            <span style={{ color: i === 0 ? "var(--v-tle)" : "var(--txt-3)", fontFamily: "var(--mono)", fontWeight: 700 }}>{i + 1}</span>
            <Link to={`/u/${encodeURIComponent(r.handle)}`} style={{ fontFamily: "var(--mono)", color: mine ? "var(--v-ac)" : "var(--txt-2)", fontWeight: mine ? 700 : 500, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={LANG_LABELS[r.language] ?? r.language}>
              {r.handle}
            </Link>
            <span style={{ fontFamily: "var(--mono)", color: "var(--txt)", fontWeight: 600 }}>{r.metric}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProblemPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Language>("cpp");
  const [source, setSource] = useState(STARTERS.cpp);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [console_, setConsole] = useState<string>("");
  const [consoleColor, setConsoleColor] = useState("var(--txt-2)");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"console" | "run">("console");
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  // Onboarding nudge shown to logged-out visitors at peak intent: "submit" when
  // they try to submit, "solved" the moment their run passes every sample.
  const [signupNudge, setSignupNudge] = useState<null | "submit" | "solved">(null);
  const [board, setBoard] = useState<ProblemLeaderboard | null>(null);
  const run = useRun(problem?.id, { poll: !user });
  const submitRef = useRef<() => void>(() => {});
  const runRef = useRef<() => void>(() => {});
  const isMobile = useMediaQuery("(max-width: 820px)");
  const [mobilePane, setMobilePane] = useState<"problem" | "code">("problem");

  useSeo({
    title: problem ? problem.title : "Loading…",
    description: problem
      ? `Solve “${problem.title}” (${problem.difficulty === "easy" ? "Easy" : problem.difficulty === "med" ? "Medium" : "Hard"}) on Code Arena. ${metaFromHtml(problem.statement, 110)}`
      : undefined,
    path: slug ? `/problems/${slug}` : undefined,
  });

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.problem(slug)
      .then((p) => { setProblem(p); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
    api.problemLeaderboard(slug).then(setBoard).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!user) return;
    api.submissions()
      .then((subs) => {
        if (problem) {
          setSubmissions(subs.filter((s) => s.problemId === problem.id));
        }
      })
      .catch(() => {});
  }, [user, problem]);

  // Restore the saved draft (or starter) whenever the problem or language
  // changes, so the editor content survives a refresh.
  useEffect(() => {
    if (!problem) return;
    setSource(loadDraft(problem.slug, lang) ?? starterFor(problem.slug, lang));
  }, [problem, lang]);

  // The onboarding "aha": a logged-out visitor whose run passes every sample
  // gets nudged to sign up right then, while motivation peaks.
  useEffect(() => {
    if (user || !run.result) return;
    const graded = run.result.cases.filter((c) => c.status === "PASS" || c.status === "FAIL");
    if (graded.length > 0 && graded.every((c) => c.status === "PASS")) {
      setSignupNudge("solved");
    }
  }, [run.result, user]);

  useWs((ev: ServerEvent) => {
    run.onEvent(ev);
    if (ev.type === "verdict" && ev.submissionId === pendingId) {
      setPendingId(null);
      const color = verdictColor(ev.result.verdict);
      setConsoleColor(color);
      let msg = verdictLabel(ev.result.verdict);
      if (ev.result.maxTimeMs > 0) msg += ` · ${ev.result.maxTimeMs}ms`;
      if (ev.result.maxMemoryKb > 0) msg += ` · ${(ev.result.maxMemoryKb / 1024).toFixed(1)}MB`;
      if (ev.result.message) msg += `\n${ev.result.message}`;
      if (ev.result.compileLog) msg += `\n\n${ev.result.compileLog}`;
      if (ev.result.runtimeLog) msg += `\n\n${ev.result.runtimeLog}`;
      if (ev.result.failedStdout) msg += `\n\nYour output on that test:\n${ev.result.failedStdout}`;
      if (ev.result.failedStderr) msg += `\n\nStderr (debug prints):\n${ev.result.failedStderr}`;
      setConsole(msg);
      if (problem) {
        setSubmissions((prev) => [
          {
            id: ev.submissionId,
            problemId: problem.id,
            language: lang,
            verdict: ev.result.verdict,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        // A new accepted solve may change the speed/brevity boards.
        if (ev.result.verdict === "ACCEPTED" && slug) {
          api.problemLeaderboard(slug).then(setBoard).catch(() => {});
        }
      }
    }
  });

  function handleReset() {
    if (!window.confirm("Reset to the starter code? Your current code will be discarded.")) return;
    const starter = problem ? starterFor(problem.slug, lang) : STARTERS[lang];
    setSource(starter);
    if (problem) saveDraft(problem.slug, lang, starter);
  }

  async function handleSubmit() {
    if (!problem) return;
    if (!user) {
      // Peak-intent moment — invite them to create an account instead of a
      // dead-end error. Their code is already saved as a draft locally.
      setSignupNudge("submit");
      return;
    }
    setConsole("Submitting…");
    setConsoleColor("var(--v-judge)");
    try {
      const r = await api.submit({ problemId: problem.id, language: lang, source });
      setPendingId(r.id);
      setConsole(`Queued [${r.id.slice(0, 8)}] — waiting for judge…`);
    } catch (e) {
      setConsole((e as Error).message);
      setConsoleColor("var(--v-wa)");
    }
  }

  function handleRun() {
    if (!problem) return;
    // Guests can run freely — this is the whole point of the onboarding flow.
    setBottomTab("run");
    run.start(lang, source, showCustom && customInput.trim() ? customInput : undefined);
  }

  // Editor-scoped commands capture their closure once at mount, so route them
  // through refs that always point at the latest handlers.
  submitRef.current = handleSubmit;
  runRef.current = handleRun;
  const handleEditorMount: OnMount = (editor, m) => {
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => submitRef.current());
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.Enter, () => runRef.current());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--ink)", overflow: "hidden" }}>
      <TopBar />

      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>
          Loading…
        </div>
      )}

      {error && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--v-wa)", padding: 32 }}>
          {error}
        </div>
      )}

      {!loading && !error && problem && (
        <div
          style={{
            flex: 1, minHeight: 0,
            ...(isMobile
              ? { display: "flex", flexDirection: "column" }
              : { display: "grid", gridTemplateColumns: "1fr 1fr" }),
          }}
        >
          {/* Mobile-only Problem / Code tab switcher */}
          {isMobile && (
            <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
              {(["problem", "code"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMobilePane(t)}
                  style={{
                    flex: 1, padding: "11px 0", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13,
                    background: mobilePane === t ? "var(--panel-2)" : "transparent",
                    color: mobilePane === t ? "var(--txt)" : "var(--txt-3)",
                    border: "none", borderBottom: `2px solid ${mobilePane === t ? "var(--v-ac)" : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  {t === "problem" ? "Problem" : "Code"}
                </button>
              ))}
            </div>
          )}
          {/* Left: Problem statement */}
          <div
            style={{
              borderRight: isMobile ? "none" : "1px solid var(--line)",
              overflow: "auto",
              padding: "20px 24px",
              ...(isMobile ? { flex: 1, minHeight: 0, display: mobilePane === "problem" ? "block" : "none" } : {}),
            }}
          >
            <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>
              {problem.title}
            </h1>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 12, color: "var(--txt-3)" }}>
              <span style={{ fontFamily: "var(--mono)" }}>Time: {problem.timeMs}ms</span>
              <span style={{ fontFamily: "var(--mono)" }}>Memory: {Math.round(problem.memoryKb / 1024)}MB</span>
              <span
                style={{
                  color: problem.difficulty === "easy" ? "var(--v-ac)" : problem.difficulty === "med" ? "var(--v-tle)" : "var(--v-wa)",
                  fontWeight: 600,
                }}
              >
                {problem.difficulty === "easy" ? "Easy" : problem.difficulty === "med" ? "Medium" : "Hard"}
              </span>
              <span style={{ fontFamily: "var(--mono)" }}>
                Solved by {problem.solved}{problem.acceptance != null ? ` · ${problem.acceptance}% AC` : ""}
              </span>
            </div>

            <div
              dangerouslySetInnerHTML={{ __html: sanitizeStatement(problem.statement) }}
              style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.8, marginBottom: 20 }}
            />

            {problem.samples.length > 0 && (
              <div>
                <h3 style={{ fontFamily: "var(--disp)", fontSize: 14, fontWeight: 600, color: "var(--txt-3)", marginBottom: 10 }}>
                  Examples
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {problem.samples.map((s) => (
                    <div key={s.ordinal}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Input {s.ordinal}</div>
                          <pre
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 12,
                              background: "var(--panel-2)",
                              border: "1px solid var(--line)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              color: "var(--txt)",
                              overflow: "auto",
                              margin: 0,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {s.input}
                          </pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>Output {s.ordinal}</div>
                          <pre
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 12,
                              background: "var(--panel-2)",
                              border: "1px solid var(--line)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              color: "var(--txt)",
                              overflow: "auto",
                              margin: 0,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {s.output}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Editorial — kept in the DOM (crawlable) but collapsed behind a
                spoiler toggle so it doesn't give the solution away by default. */}
            {problem.editorial && (
              <details style={{ marginTop: 28, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", padding: "0 16px" }}>
                <summary style={{ cursor: "pointer", padding: "12px 0", fontFamily: "var(--disp)", fontSize: 14, fontWeight: 600, color: "var(--v-tle)", listStyle: "none" }}>
                  📖 Editorial — solution walkthrough (spoiler)
                </summary>
                <div
                  className="editorial"
                  dangerouslySetInnerHTML={{ __html: sanitizeStatement(problem.editorial) }}
                  style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.8, padding: "4px 0 16px" }}
                />
              </details>
            )}

            {/* Submission history */}
            {submissions.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h3 style={{ fontFamily: "var(--disp)", fontSize: 14, fontWeight: 600, color: "var(--txt-3)", marginBottom: 10 }}>
                  My Submissions
                </h3>
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {submissions.map((sub, i) => (
                    <div
                      key={sub.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderBottom: i < submissions.length - 1 ? "1px solid var(--line-soft)" : "none",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ fontFamily: "var(--mono)", color: verdictColor(sub.verdict), fontWeight: 700, flex: 1 }}>
                        {verdictLabel(sub.verdict)}
                      </span>
                      <span style={{ color: "var(--txt-3)", fontFamily: "var(--mono)", fontSize: 11 }}>
                        {LANG_LABELS[sub.language]}
                      </span>
                      <span style={{ color: "var(--txt-3)", fontSize: 11 }}>{timeAgo(sub.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Speed & brevity leaderboards */}
            {board && (board.fastest.length > 0 || board.shortest.length > 0) && (
              <div style={{ marginTop: 28 }}>
                <h3 style={{ fontFamily: "var(--disp)", fontSize: 14, fontWeight: 600, color: "var(--txt-3)", marginBottom: 10 }}>
                  Leaderboard
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <LeaderColumn
                    title="⚡ Fastest runtime"
                    rows={board.fastest.map((r) => ({ handle: r.handle, metric: `${r.timeMs}ms`, language: r.language }))}
                    me={user?.handle}
                  />
                  <LeaderColumn
                    title="✂️ Shortest code"
                    rows={board.shortest.map((r) => ({ handle: r.handle, metric: `${r.chars} ch`, language: r.language }))}
                    me={user?.handle}
                  />
                </div>
                {user && !submissions.some((s) => s.verdict === "ACCEPTED") && (
                  <div style={{ color: "var(--txt-3)", fontSize: 12, marginTop: 10 }}>
                    Solve it to claim your spot — the fastest and shortest accepted solutions rank here.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Editor + console */}
          <div
            style={{
              display: isMobile && mobilePane !== "code" ? "none" : "flex",
              flexDirection: "column",
              minHeight: 0,
              ...(isMobile ? { flex: 1 } : {}),
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                rowGap: 6,
                flexWrap: "wrap",
                padding: "8px 12px",
                borderBottom: "1px solid var(--line)",
                background: "var(--panel)",
                flexShrink: 0,
              }}
            >
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  color: "var(--txt)",
                  fontSize: 12,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                {(Object.entries(LANG_LABELS) as [Language, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--txt-3)", cursor: "pointer" }}>
                <input type="checkbox" checked={showCustom} onChange={(e) => setShowCustom(e.target.checked)} />
                Custom input
              </label>
              <div style={{ flex: 1 }} />
              <Link
                to={`/race/${problem.slug}`}
                title="Race a ghost — solve against the clock and a past solver"
                style={{
                  background: "transparent", color: "var(--v-tle)", fontWeight: 700, fontSize: 12,
                  padding: "5px 12px", border: "1px solid var(--v-tle)", borderRadius: 6,
                  fontFamily: "var(--disp)", textDecoration: "none",
                }}
              >
                ⚡ Race
              </Link>
              <button
                onClick={handleReset}
                title="Reset to starter code"
                style={{
                  background: "transparent",
                  color: "var(--txt-2)",
                  fontWeight: 500,
                  fontSize: 12,
                  padding: "5px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "var(--disp)",
                }}
              >
                Reset
              </button>
              <button
                onClick={handleRun}
                disabled={run.running}
                title="Run against sample cases (⌘/Ctrl+Shift+Enter)"
                style={{
                  background: "var(--panel-2)",
                  color: "var(--txt)",
                  fontWeight: 600,
                  fontSize: 12,
                  padding: "5px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  cursor: run.running ? "not-allowed" : "pointer",
                  fontFamily: "var(--disp)",
                  opacity: run.running ? 0.7 : 1,
                }}
              >
                {run.running ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={handleSubmit}
                title="Submit for judging (⌘/Ctrl+Enter)"
                style={{
                  background: "var(--v-ac)",
                  color: "#06210C",
                  fontWeight: 700,
                  fontSize: 12,
                  padding: "5px 14px",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "var(--disp)",
                }}
              >
                Submit
              </button>
            </div>

            {showCustom && (
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Custom stdin for ▶ Run (leave blank to use samples)…"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", fontFamily: "var(--mono)", fontSize: 12, padding: "6px 8px", resize: "vertical" }}
                />
              </div>
            )}

            {/* Monaco editor */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor
                height="100%"
                theme="vs-dark"
                language={MONACO_LANG[lang]}
                value={source}
                onChange={(v) => {
                  const val = v ?? "";
                  setSource(val);
                  if (problem) saveDraft(problem.slug, lang, val);
                }}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 8, bottom: 8 },
                  automaticLayout: true,
                }}
              />
            </div>

            {/* Console / Run results (tabbed) */}
            <div
              style={{
                height: 190,
                borderTop: "1px solid var(--line)",
                background: "var(--panel)",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", gap: 4, padding: "6px 12px 0", flexShrink: 0 }}>
                {(["console", "run"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBottomTab(t)}
                    style={{
                      fontSize: 10, letterSpacing: "0.08em", fontWeight: 600, padding: "4px 10px",
                      background: bottomTab === t ? "var(--panel-2)" : "transparent",
                      border: "1px solid " + (bottomTab === t ? "var(--line)" : "transparent"),
                      borderBottom: "none", borderRadius: "5px 5px 0 0",
                      color: bottomTab === t ? "var(--txt)" : "var(--txt-3)", cursor: "pointer", fontFamily: "var(--disp)",
                    }}
                  >
                    {t === "console" ? "CONSOLE" : "RUN RESULTS"}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
                {bottomTab === "console" ? (
                  <pre style={{ fontFamily: "var(--mono)", fontSize: 12, color: consoleColor, margin: 0, whiteSpace: "pre-wrap" }}>
                    {console_ || "Submit your solution to see results."}
                  </pre>
                ) : run.result || run.running ? (
                  <RunResults result={run.result} running={run.running} />
                ) : (
                  <div style={{ color: "var(--txt-3)", fontSize: 12 }}>Press ▶ Run to test against the sample cases.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {signupNudge && (
        <div
          onClick={() => setSignupNudge(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 400, background: "var(--panel)", border: "1px solid var(--line)",
              borderRadius: 12, padding: 28, textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 8 }}>{signupNudge === "solved" ? "🎉" : "🚀"}</div>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 19, fontWeight: 700, color: "var(--txt)", margin: "0 0 8px" }}>
              {signupNudge === "solved" ? "Nice — that passes every sample!" : "Create a free account"}
            </h2>
            <p style={{ color: "var(--txt-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              {signupNudge === "solved"
                ? "Create a free account to submit it for real, track what you've solved, and start a daily streak. It takes about ten seconds — your code is saved."
                : "Sign up to submit your solution, save your progress, and compete on the leaderboard. Your code is already saved on this device."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                to="/login"
                style={{
                  background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
                  padding: "11px 0", borderRadius: 8, textDecoration: "none", fontFamily: "var(--disp)",
                }}
              >
                Create account & submit
              </Link>
              <button
                onClick={() => setSignupNudge(null)}
                style={{
                  background: "transparent", color: "var(--txt-3)", fontWeight: 500, fontSize: 13,
                  padding: "6px 0", border: "none", cursor: "pointer", fontFamily: "var(--disp)",
                }}
              >
                Keep exploring
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
