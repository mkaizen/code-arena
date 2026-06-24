import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";

interface TestCase { input: string; output: string; }

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--txt)",
  fontSize: 14,
  padding: "10px 14px",
  outline: "none",
  fontFamily: "var(--body)",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--txt-2)",
  marginBottom: 6,
  fontWeight: 500,
};

function TestCaseEditor({ label, cases, onChange }: { label: string; cases: TestCase[]; onChange: (c: TestCase[]) => void }) {
  function update(i: number, field: "input" | "output", val: string) {
    const next = cases.map((c, idx) => idx === i ? { ...c, [field]: val } : c);
    onChange(next);
  }
  function add() { onChange([...cases, { input: "", output: "" }]); }
  function remove(i: number) { onChange(cases.filter((_, idx) => idx !== i)); }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ ...labelStyle, marginBottom: 0 }}>{label}</span>
        <button type="button" onClick={add} style={{ fontSize: 12, color: "var(--v-ac)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--disp)", fontWeight: 600 }}>
          + Add
        </button>
      </div>
      {cases.map((c, i) => (
        <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>#{i + 1}</span>
            {cases.length > 1 && (
              <button type="button" onClick={() => remove(i)} style={{ fontSize: 11, color: "var(--v-wa)", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Input</label>
              <textarea value={c.input} onChange={(e) => update(i, "input", e.target.value)} rows={3}
                style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 12, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>Expected Output</label>
              <textarea value={c.output} onChange={(e) => update(i, "output", e.target.value)} rows={3}
                style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 12, resize: "vertical" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminProblemNewPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "med" | "hard">("easy");
  const [ratingValue, setRatingValue] = useState(1200);
  const [tags, setTags] = useState("");
  const [timeMs, setTimeMs] = useState(2000);
  const [memoryKb, setMemoryKb] = useState(262144);
  const [samples, setSamples] = useState<TestCase[]>([{ input: "", output: "" }]);
  const [tests, setTests] = useState<TestCase[]>([{ input: "", output: "" }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.adminCreateProblem({
        slug, title, statement, difficulty, ratingValue,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        timeMs, memoryKb, samples, tests,
      });
      navigate(`/problems/${result.slug}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 28 }}>New Problem</h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Slug</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="two-sum" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum" required style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Statement (Markdown)</label>
            <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={8} required
              style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 13, resize: "vertical" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "med" | "hard")} style={inputStyle}>
                <option value="easy">Easy</option>
                <option value="med">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Rating Value</label>
              <input type="number" value={ratingValue} onChange={(e) => setRatingValue(Number(e.target.value))} min={800} max={3500} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time Limit (ms)</label>
              <input type="number" value={timeMs} onChange={(e) => setTimeMs(Number(e.target.value))} min={100} max={10000} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Memory (KB)</label>
              <input type="number" value={memoryKb} onChange={(e) => setMemoryKb(Number(e.target.value))} min={16384} max={524288} required style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="arrays, hash-map" style={inputStyle} />
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <TestCaseEditor label="Sample Test Cases" cases={samples} onChange={setSamples} />
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <TestCaseEditor label="Judge Test Cases" cases={tests} onChange={setTests} />
          </div>

          {error && (
            <div style={{ background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)", borderRadius: 6, padding: "10px 14px", color: "var(--v-wa)", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" disabled={loading} style={{
              background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
              padding: "11px 28px", border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "var(--disp)", opacity: loading ? 0.7 : 1,
            }}>
              {loading ? "Creating…" : "Create Problem"}
            </button>
            <button type="button" onClick={() => navigate("/admin")} style={{
              background: "transparent", color: "var(--txt-2)", fontWeight: 500, fontSize: 14,
              padding: "11px 20px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
