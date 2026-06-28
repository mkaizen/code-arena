import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { tierOf, type Language, type ServerEvent, type LeaderboardRow, type JudgeResult } from "@arena/shared";
import { api, type Contest, type Problem, type ProblemSummary } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";

const STARTERS: Record<Language, string> = {
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  ios_base::sync_with_stdio(false);\n  cin.tie(NULL);\n  \n  return 0;\n}\n',
  py: "import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nsolve()\n",
  java: "import java.util.*;\nimport java.io.*;\npublic class Main {\n  public static void main(String[] args) throws IOException {\n    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n    \n  }\n}\n",
  js: "const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nlet idx = 0;\n",
  go: "package main\n\nimport (\n  \"bufio\"\n  \"fmt\"\n  \"os\"\n)\n\nfunc main() {\n  reader := bufio.NewReader(os.Stdin)\n  _ = reader\n  _ = fmt.Sprint\n}\n",
  rs: "use std::io::{self, BufRead};\n\nfn main() {\n  let stdin = io.stdin();\n  for line in stdin.lock().lines() {\n    let _line = line.unwrap();\n  }\n}\n",
};

const LANG_LABELS: Record<Language, string> = {
  cpp: "C++17", py: "Python 3", java: "Java 17", js: "JavaScript", go: "Go", rs: "Rust",
};

const MONACO_LANG: Record<Language, string> = {
  cpp: "cpp", py: "python", java: "java", js: "javascript", go: "go", rs: "rust",
};

interface ContestProblem extends ProblemSummary {
  letter: string;
}

function verdictColor(verdict: string): string {
  if (verdict === "ACCEPTED") return "var(--v-ac)";
  if (verdict === "WRONG_ANSWER" || verdict === "RUNTIME_ERROR" || verdict === "MEMORY_LIMIT_EXCEEDED") return "var(--v-wa)";
  if (verdict === "TIME_LIMIT_EXCEEDED") return "var(--v-tle)";
  if (verdict === "COMPILATION_ERROR") return "var(--v-ce)";
  if (verdict === "PENDING" || verdict === "JUDGING") return "var(--v-judge)";
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

function ContestTimer({ startsAt, durationSec }: { startsAt: string; durationSec: number }) {
  const [remaining, setRemaining] = useState(0);
  const [phase, setPhase] = useState<"upcoming" | "live" | "ended">("upcoming");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const start = new Date(startsAt).getTime();
      const end = start + durationSec * 1000;
      if (now < start) {
        setPhase("upcoming");
        setRemaining(start - now);
      } else if (now < end) {
        setPhase("live");
        setRemaining(end - now);
      } else {
        setPhase("ended");
        setRemaining(0);
      }
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startsAt, durationSec]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const warn = remaining < 30 * 60 * 1000 && remaining > 5 * 60 * 1000;
  const critical = remaining < 5 * 60 * 1000 && phase === "live";

  let color = "var(--txt)";
  if (warn) color = "var(--v-tle)";
  if (critical) color = "var(--v-wa)";

  return (
    <div
      style={{
        fontFamily: "var(--mono)",
        fontSize: 15,
        fontWeight: 700,
        color,
        animation: critical ? "flash 1s step-start infinite" : undefined,
      }}
    >
      {phase === "upcoming" ? `Starts in ${timeStr}` : phase === "ended" ? "Ended" : timeStr}
    </div>
  );
}

interface ConsoleEntry {
  type: "submit" | "verdict" | "error";
  submissionId?: string;
  verdict?: string;
  result?: JudgeResult;
  message?: string;
}

export function ContestPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [contest, setContest] = useState<Contest | null>(null);
  const [problems, setProblems] = useState<ContestProblem[]>([]);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [activeLetter, setActiveLetter] = useState<string>("");
  const [lang, setLang] = useState<Language>("cpp");
  const [sources, setSources] = useState<Record<string, string>>({});
  const [console_, setConsole] = useState<ConsoleEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ frozen: boolean; rows: LeaderboardRow[] }>({ frozen: false, rows: [] });
  const [submittedProblems, setSubmittedProblems] = useState<Record<string, "solved" | "tried">>({});
  const [loadingProblem, setLoadingProblem] = useState(false);
  const pendingSubmissions = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!id) return;
    api.leaderboard(id).then((lb) => setLeaderboard(lb)).catch(() => {});

    api.contest(id).then((c) => {
      setContest(c);
      const letters = "ABCDEFGHIJ";
      if (c.problems && c.problems.length > 0) {
        // Use the contest's actual problems, labelled as configured.
        const cps: ContestProblem[] = c.problems.map((entry, i) => ({
          ...entry.problem,
          letter: entry.label || letters[i] || String(i + 1),
        }));
        setProblems(cps);
        if (cps.length > 0) selectProblem(cps[0]);
      } else {
        // Fallback: contest has no problems attached — show the global bank.
        api.problems().then((ps) => {
          const cps: ContestProblem[] = ps.slice(0, 8).map((p, i) => ({
            ...p,
            letter: letters[i] ?? String(i + 1),
          }));
          setProblems(cps);
          if (cps.length > 0) selectProblem(cps[0]);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [id]);

  function selectProblem(cp: ContestProblem) {
    setActiveLetter(cp.letter);
    setLoadingProblem(true);
    api.problem(cp.slug).then((p) => {
      setActiveProblem(p);
      if (!sources[cp.slug]) {
        setSources((s) => ({ ...s, [cp.slug]: STARTERS[lang] }));
      }
    }).catch(() => {}).finally(() => setLoadingProblem(false));
  }

  function getSource(): string {
    return (activeProblem && sources[activeProblem.slug]) ?? STARTERS[lang];
  }

  function setSource(val: string) {
    if (!activeProblem) return;
    setSources((s) => ({ ...s, [activeProblem.slug]: val }));
  }

  async function handleSubmit() {
    if (!activeProblem || !id) return;
    const source = getSource();
    setConsole((c) => [...c, { type: "submit", verdict: "PENDING", message: "Submitting…" }]);
    try {
      // Ensure registered (idempotent — server accepts duplicate registrations).
      await api.registerContest(id).catch(() => {});
      const r = await api.submit({ problemId: activeProblem.id, contestId: id, language: lang, source });
      pendingSubmissions.current.set(r.id, activeProblem.id);
      setConsole((c) => [...c, { type: "submit", submissionId: r.id, verdict: "JUDGING", message: `Submission ${r.id} queued` }]);
    } catch (e) {
      setConsole((c) => [...c, { type: "error", message: (e as Error).message }]);
    }
  }

  const handleWsEvent = useCallback((ev: ServerEvent) => {
    if (ev.type === "verdict") {
      const { submissionId, result } = ev;
      if (pendingSubmissions.current.has(submissionId)) {
        const probId = pendingSubmissions.current.get(submissionId)!;
        pendingSubmissions.current.delete(submissionId);
        setConsole((c) => [
          ...c,
          { type: "verdict", submissionId, verdict: result.verdict, result },
        ]);
        if (result.verdict === "ACCEPTED") {
          setSubmittedProblems((sp) => ({ ...sp, [probId]: "solved" }));
        } else if (!(submittedProblems[probId] === "solved")) {
          setSubmittedProblems((sp) => ({ ...sp, [probId]: "tried" }));
        }
      }
    } else if (ev.type === "leaderboard" && ev.contestId === id) {
      setLeaderboard({ frozen: ev.frozen, rows: ev.rows });
    }
  }, [id, submittedProblems]);

  useWs(handleWsEvent);

  const tier = user ? tierOf(user.rating) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--ink)", overflow: "hidden" }}>
      {/* Contest Top Bar */}
      <header
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
          flexShrink: 0,
          gap: 16,
        }}
      >
        <Link
          to="/contests"
          style={{
            fontFamily: "var(--disp)",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--txt)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: "var(--txt-3)", fontWeight: 400, fontSize: 13 }}>←</span>
          Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
        </Link>

        <div style={{ width: 1, height: 24, background: "var(--line)" }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contest?.name ?? "Contest"}
            </span>
            {contest && (
              <>
                <span style={{ fontSize: 11, color: "var(--txt-3)", padding: "2px 6px", background: "var(--panel-2)", borderRadius: 4, border: "1px solid var(--line)", fontWeight: 500 }}>
                  {contest.scoring}
                </span>
                {contest.rated && (
                  <span style={{ fontSize: 11, color: "var(--t-cm)", padding: "2px 6px", background: "rgba(163,113,247,0.1)", borderRadius: 4, border: "1px solid rgba(163,113,247,0.2)", fontWeight: 600 }}>
                    RATED
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {contest && (
          <ContestTimer startsAt={contest.startsAt} durationSec={contest.durationSec} />
        )}

        <div style={{ width: 1, height: 24, background: "var(--line)" }} />

        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: tier?.color ?? "var(--txt)", fontWeight: 700 }}>
              {user.handle}
            </span>
            <span style={{ fontSize: 11, color: tier?.color ?? "var(--txt-2)", fontWeight: 600 }}>
              {user.rating}
            </span>
          </div>
        )}
      </header>

      {/* 3-column layout */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: Problem list */}
        <aside
          style={{
            width: 188,
            flexShrink: 0,
            borderRight: "1px solid var(--line)",
            background: "var(--panel)",
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 12px 8px",
              borderBottom: "1px solid var(--line-soft)",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--txt-3)",
              fontWeight: 600,
            }}
          >
            PROBLEMS
          </div>
          {problems.map((cp) => {
            const pState = submittedProblems[cp.id];
            const isActive = activeLetter === cp.letter;
            return (
              <button
                key={cp.id}
                onClick={() => selectProblem(cp)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: isActive ? "var(--panel-2)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--line-soft)",
                  color: isActive ? "var(--txt)" : "var(--txt-2)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.1s",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    width: 18,
                    color: pState === "solved"
                      ? "var(--v-ac)"
                      : pState === "tried"
                      ? "var(--v-wa)"
                      : isActive ? "var(--txt)" : "var(--txt-3)",
                  }}
                >
                  {cp.letter}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cp.title}
                  </div>
                  <div style={{ fontSize: 10, color: diffColor(cp.difficulty), marginTop: 1 }}>
                    {cp.difficulty === "easy" ? "Easy" : cp.difficulty === "med" ? "Med" : "Hard"}
                  </div>
                </div>
                {pState && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: pState === "solved" ? "var(--v-ac)" : "var(--v-wa)",
                      flexShrink: 0,
                      marginLeft: "auto",
                    }}
                  />
                )}
              </button>
            );
          })}
        </aside>

        {/* Center: Problem statement + editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {loadingProblem ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt-3)" }}>
              Loading…
            </div>
          ) : activeProblem ? (
            <>
              {/* Problem Statement (top ~40%) */}
              <div
                style={{
                  flex: "0 0 40%",
                  overflow: "auto",
                  borderBottom: "1px solid var(--line)",
                  padding: "16px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <h2 style={{ fontFamily: "var(--disp)", fontSize: 18, fontWeight: 700, color: "var(--txt)" }}>
                    {activeLetter}. {activeProblem.title}
                  </h2>
                  <span style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>
                    {activeProblem.timeMs}ms · {Math.round(activeProblem.memoryKb / 1024)}MB
                  </span>
                </div>

                <div
                  dangerouslySetInnerHTML={{ __html: activeProblem.statement }}
                  style={{ color: "var(--txt-2)", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
                />

                {activeProblem.samples.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--txt-3)", fontWeight: 600, marginBottom: 8 }}>
                      EXAMPLES
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {activeProblem.samples.map((s) => (
                        <div key={s.ordinal} style={{ display: "contents" }}>
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
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Editor (middle) */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>
                <select
                  value={lang}
                  onChange={(e) => {
                    const l = e.target.value as Language;
                    setLang(l);
                    if (activeProblem && !sources[`${activeProblem.slug}_${l}`]) {
                      setSources((s) => ({ ...s, [activeProblem.slug]: STARTERS[l] }));
                    }
                  }}
                  style={{
                    background: "var(--panel-2)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    color: "var(--txt)",
                    fontSize: 12,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontFamily: "var(--body)",
                  }}
                >
                  {(Object.entries(LANG_LABELS) as [Language, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <div style={{ flex: 1 }} />
                <button
                  onClick={handleSubmit}
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

              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={MONACO_LANG[lang]}
                  value={getSource()}
                  onChange={(v) => setSource(v ?? "")}
                  options={{
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbersMinChars: 3,
                    padding: { top: 8, bottom: 8 },
                  }}
                />
              </div>

              {/* Console */}
              <div
                style={{
                  height: 140,
                  borderTop: "1px solid var(--line)",
                  background: "var(--panel)",
                  overflow: "auto",
                  padding: "8px 12px",
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--txt-3)", marginBottom: 6, fontWeight: 600 }}>
                  CONSOLE
                </div>
                {console_.length === 0 && (
                  <div style={{ color: "var(--txt-3)", fontSize: 12 }}>No submissions yet.</div>
                )}
                {console_.map((entry, i) => (
                  <div key={i} style={{ marginBottom: 4, fontFamily: "var(--mono)", fontSize: 12 }}>
                    {entry.type === "error" ? (
                      <span style={{ color: "var(--v-wa)" }}>Error: {entry.message}</span>
                    ) : entry.verdict ? (
                      <span>
                        {entry.submissionId && <span style={{ color: "var(--txt-3)" }}>[{entry.submissionId.slice(0, 8)}] </span>}
                        <span style={{ color: verdictColor(entry.verdict), fontWeight: 700 }}>{verdictLabel(entry.verdict)}</span>
                        {entry.result && entry.result.maxTimeMs > 0 && (
                          <span style={{ color: "var(--txt-3)" }}> · {entry.result.maxTimeMs}ms · {Math.round(entry.result.maxMemoryKb / 1024)}KB</span>
                        )}
                        {entry.result?.compileLog && (
                          <pre style={{ color: "var(--v-ce)", marginTop: 4, fontSize: 11, whiteSpace: "pre-wrap" }}>{entry.result.compileLog}</pre>
                        )}
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
              Select a problem
            </div>
          )}
        </div>

        {/* Right: Live leaderboard */}
        <aside
          style={{
            width: 296,
            flexShrink: 0,
            borderLeft: "1px solid var(--line)",
            background: "var(--panel)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px 8px",
              borderBottom: "1px solid var(--line-soft)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--txt-3)", fontWeight: 600 }}>
              LIVE STANDINGS
            </span>
            {leaderboard.frozen && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "rgba(76,141,255,0.15)",
                  color: "var(--v-judge)",
                  border: "1px solid rgba(76,141,255,0.3)",
                }}
              >
                FROZEN
              </span>
            )}
          </div>

          <div style={{ overflow: "auto", flex: 1 }}>
            {leaderboard.rows.length === 0 ? (
              <div style={{ color: "var(--txt-3)", fontSize: 12, padding: "12px 12px" }}>
                No submissions yet.
              </div>
            ) : (
              leaderboard.rows.map((row) => {
                const rowTier = tierOf(row.rating);
                return (
                  <div
                    key={row.userId}
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--line-soft)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)", width: 20, flexShrink: 0 }}>
                      {row.rank}
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: rowTier.color, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.handle}
                    </span>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {problems.map((cp) => {
                        const pp = row.perProblem[cp.id];
                        return (
                          <span
                            key={cp.id}
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--mono)",
                              fontWeight: 700,
                              width: 18,
                              height: 18,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 3,
                              background: pp?.solved
                                ? "rgba(63,185,80,0.2)"
                                : pp?.tries
                                ? "rgba(255,92,92,0.2)"
                                : "var(--panel-2)",
                              color: pp?.solved
                                ? "var(--v-ac)"
                                : pp?.tries
                                ? "var(--v-wa)"
                                : "var(--txt-3)",
                              border: `1px solid ${pp?.solved ? "rgba(63,185,80,0.3)" : pp?.tries ? "rgba(255,92,92,0.3)" : "var(--line)"}`,
                            }}
                          >
                            {cp.letter}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--v-ac)", fontWeight: 700 }}>
                        {row.solved}
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--txt-3)" }}>
                        {row.penalty}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  if (d === "hard") return "var(--v-wa)";
  return "var(--txt-3)";
}
