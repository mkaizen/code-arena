import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { type Language } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api, type Problem, type Submission } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useWs } from "../hooks/useWs.js";
import type { ServerEvent } from "@arena/shared";

const STARTERS: Record<Language, string> = {
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  ios_base::sync_with_stdio(false);\n  cin.tie(NULL);\n  \n  return 0;\n}\n',
  py: "import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nsolve()\n",
  java: "import java.util.*;\nimport java.io.*;\npublic class Main {\n  public static void main(String[] args) throws IOException {\n    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n  }\n}\n",
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

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.problem(slug)
      .then((p) => { setProblem(p); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
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

  useWs((ev: ServerEvent) => {
    if (ev.type === "verdict" && ev.submissionId === pendingId) {
      setPendingId(null);
      const color = verdictColor(ev.result.verdict);
      setConsoleColor(color);
      let msg = verdictLabel(ev.result.verdict);
      if (ev.result.maxTimeMs > 0) msg += ` · ${ev.result.maxTimeMs}ms`;
      if (ev.result.message) msg += `\n${ev.result.message}`;
      if (ev.result.compileLog) msg += `\n\n${ev.result.compileLog}`;
      if (ev.result.runtimeLog) msg += `\n\n${ev.result.runtimeLog}`;
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
      }
    }
  });

  async function handleSubmit() {
    if (!problem || !user) {
      setConsole("You must be logged in to submit.");
      setConsoleColor("var(--v-wa)");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--ink)", overflow: "hidden" }}>
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
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
          {/* Left: Problem statement */}
          <div
            style={{
              borderRight: "1px solid var(--line)",
              overflow: "auto",
              padding: "20px 24px",
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
            </div>

            <div
              dangerouslySetInnerHTML={{ __html: problem.statement }}
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
          </div>

          {/* Right: Editor + console */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid var(--line)",
                background: "var(--panel)",
                flexShrink: 0,
              }}
            >
              <select
                value={lang}
                onChange={(e) => {
                  const l = e.target.value as Language;
                  setLang(l);
                  setSource(STARTERS[l]);
                }}
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

            {/* Monaco editor */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor
                height="100%"
                theme="vs-dark"
                language={MONACO_LANG[lang]}
                value={source}
                onChange={(v) => setSource(v ?? "")}
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>

            {/* Console */}
            <div
              style={{
                height: 100,
                borderTop: "1px solid var(--line)",
                background: "var(--panel)",
                padding: "8px 12px",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--txt-3)", marginBottom: 4, fontWeight: 600 }}>
                CONSOLE
              </div>
              <pre
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: consoleColor,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  overflow: "auto",
                  maxHeight: 60,
                }}
              >
                {console_ || "Submit your solution to see results."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
