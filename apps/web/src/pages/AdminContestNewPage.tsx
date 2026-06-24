import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { api, type ProblemSummary } from "../api.js";

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

interface ContestProblem { problemId: string; label: string; points: number; }

export function AdminContestNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 3600_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // for datetime-local input
  });
  const [durationHours, setDurationHours] = useState(2);
  const [scoring, setScoring] = useState<"ICPC" | "POINTS">("ICPC");
  const [rated, setRated] = useState(true);
  const [freezeMin, setFreezeMin] = useState(30);
  const [problems, setProblems] = useState<ContestProblem[]>([]);
  const [allProblems, setAllProblems] = useState<ProblemSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.problems().then(setAllProblems).catch(() => {});
  }, []);

  function addProblem() {
    const label = String.fromCharCode(65 + problems.length); // A, B, C…
    setProblems([...problems, { problemId: "", label, points: 100 }]);
  }

  function updateProblem(i: number, field: keyof ContestProblem, val: string | number) {
    setProblems(problems.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }

  function removeProblem(i: number) {
    setProblems(problems.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.adminCreateContest({
        name,
        startsAt: new Date(startsAt).toISOString(),
        durationSec: durationHours * 3600,
        scoring,
        rated,
        freezeSec: freezeMin * 60,
        problems: problems.filter((p) => p.problemId),
      });
      navigate(`/contests/${result.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--txt)", marginBottom: 28 }}>New Contest</h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Code Arena Round 1" required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Start Time (local)</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Duration (hours)</label>
              <input type="number" value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} min={0.5} max={24} step={0.5} required style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Scoring</label>
              <select value={scoring} onChange={(e) => setScoring(e.target.value as "ICPC" | "POINTS")} style={inputStyle}>
                <option value="ICPC">ICPC</option>
                <option value="POINTS">Points</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Leaderboard Freeze (min before end)</label>
              <input type="number" value={freezeMin} onChange={(e) => setFreezeMin(Number(e.target.value))} min={0} max={60} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 2 }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} />
                Rated contest
              </label>
            </div>
          </div>

          {/* Problem list */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--txt-2)" }}>Problems</span>
              <button type="button" onClick={addProblem} style={{ fontSize: 12, color: "var(--v-ac)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--disp)", fontWeight: 600 }}>
                + Add Problem
              </button>
            </div>

            {problems.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--txt-3)", fontStyle: "italic" }}>No problems added yet — contest can be edited after creation.</p>
            )}

            {problems.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input value={p.label} onChange={(e) => updateProblem(i, "label", e.target.value)} maxLength={4} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Problem</label>
                  <select value={p.problemId} onChange={(e) => updateProblem(i, "problemId", e.target.value)} style={inputStyle}>
                    <option value="">— select —</option>
                    {allProblems.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Points</label>
                  <input type="number" value={p.points} onChange={(e) => updateProblem(i, "points", Number(e.target.value))} min={0} style={inputStyle} />
                </div>
                <button type="button" onClick={() => removeProblem(i)} style={{ fontSize: 12, color: "var(--v-wa)", background: "none", border: "none", cursor: "pointer", paddingBottom: 12 }}>✕</button>
              </div>
            ))}
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
              {loading ? "Creating…" : "Create Contest"}
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
