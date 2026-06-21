import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { tierOf, type Language } from "@arena/shared";
import { api } from "./api.js";

const STARTERS: Record<Language, string> = {
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  return 0;\n}\n",
  py: "import sys\ndef solve():\n    pass\nsolve()\n",
  java: "import java.util.*;\npublic class Main {\n  public static void main(String[] a){}\n}\n",
  js: "const data = require('fs').readFileSync(0,'utf8');\n",
  go: "package main\nimport \"fmt\"\nfunc main(){ _ = fmt.Sprint }\n",
  rs: "fn main(){}\n",
};

interface ProblemSummary { id: string; slug: string; title: string; ratingValue: number; }

export function App() {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [active, setActive] = useState<ProblemSummary | null>(null);
  const [lang, setLang] = useState<Language>("cpp");
  const [source, setSource] = useState(STARTERS.cpp);
  const [verdict, setVerdict] = useState<string>("");

  useEffect(() => {
    api.problems().then((p: ProblemSummary[]) => { setProblems(p); setActive(p[0] ?? null); }).catch(() => {});
  }, []);

  async function submit() {
    if (!active) return;
    setVerdict("Judging…");
    try {
      const r = await api.submit({ problemId: active.id, language: lang, source });
      setVerdict(`Queued (${r.id})`);
    } catch (e) {
      setVerdict((e as Error).message);
    }
  }

  const tier = active ? tierOf(active.ratingValue) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", height: "100vh", fontFamily: "Inter, sans-serif", background: "#0E1116", color: "#E6EDF3" }}>
      <aside style={{ borderRight: "1px solid #262C36", padding: 12, overflow: "auto" }}>
        <h3 style={{ fontSize: 12, letterSpacing: "0.1em", color: "#5C6571" }}>PROBLEMS</h3>
        {problems.map((p) => (
          <button key={p.id} onClick={() => setActive(p)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: 8, background: active?.id === p.id ? "#1B2129" : "transparent", color: "#E6EDF3", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 2 }}>
            {p.title}
          </button>
        ))}
      </aside>
      <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <header style={{ padding: 16, borderBottom: "1px solid #262C36" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{active?.title ?? "Loading…"}</h1>
          {tier && <span style={{ color: tier.color, fontFamily: "monospace" }}>rating {active?.ratingValue} · {tier.name}</span>}
        </header>
        <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid #262C36" }}>
          <select value={lang} onChange={(e) => { const l = e.target.value as Language; setLang(l); setSource(STARTERS[l]); }}>
            <option value="cpp">C++17</option><option value="py">Python 3</option><option value="java">Java 17</option>
            <option value="js">JavaScript</option><option value="go">Go</option><option value="rs">Rust</option>
          </select>
          <span style={{ marginLeft: "auto", fontFamily: "monospace", color: "#8B949E" }}>{verdict}</span>
          <button onClick={submit} style={{ background: "#3FB950", color: "#06210C", fontWeight: 700, border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>Submit</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor height="100%" theme="vs-dark" language={lang === "py" ? "python" : lang === "cpp" ? "cpp" : lang}
            value={source} onChange={(v) => setSource(v ?? "")} options={{ fontSize: 13, minimap: { enabled: false } }} />
        </div>
      </main>
    </div>
  );
}
