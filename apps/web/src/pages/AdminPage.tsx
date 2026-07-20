import { useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../ctx/AuthContext.js";
import { api } from "../api.js";

export function AdminPage() {
  const { user } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  if (!user || (user.role !== "ADMIN" && user.role !== "SETTER")) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--v-wa)", fontSize: 15 }}>Access denied — admins and setters only.</p>
      </div>
    );
  }

  async function handleResetAiBoard() {
    if (!window.confirm("Reset the AI-vs-AI board? This clears all model-vs-model exhibitions and resets every model's Elo to the baseline. Human matches and ratings are untouched.")) return;
    setResetting(true);
    setResetMsg("");
    try {
      const r = await api.adminResetAiBoard();
      setResetMsg(`✓ Cleared ${r.clearedExhibitions} exhibition${r.clearedExhibitions === 1 ? "" : "s"} and reset ${r.resetModels} model${r.resetModels === 1 ? "" : "s"}.`);
    } catch (e) {
      setResetMsg(`✗ ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  }

  const cards = [
    { to: "/admin/problems", title: "Manage Problems", desc: "Browse the bank and edit any problem's statement, metadata, or tests." },
    { to: "/admin/problems/new", title: "Create Problem", desc: "Write a new problem, add sample I/O and test cases." },
    { to: "/admin/contests/new", title: "Create Contest", desc: "Schedule a new rated or unrated contest." },
    { to: "/admin/contests/finalize", title: "Finalize Ratings", desc: "Run Elo recompute for a finished contest." },
    { to: "/admin/plagiarism", title: "Similarity Scan", desc: "Flag structurally similar submission pairs in a contest for review." },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)", marginBottom: 8 }}>Admin Panel</h1>
        <p style={{ color: "var(--txt-3)", fontSize: 13, marginBottom: 32 }}>Logged in as <span style={{ color: "var(--v-ac)" }}>{user.handle}</span> · {user.role}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {cards.map((c) => (
            <Link key={c.to} to={c.to} style={{ textDecoration: "none" }}>
              <div
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 24,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--v-ac)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--line)")}
              >
                <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--txt)", marginBottom: 8 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: "var(--txt-3)", lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Operations */}
        <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, color: "var(--txt)", margin: "36px 0 12px" }}>Operations</h2>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)", marginBottom: 4 }}>Reset AI board</div>
            <div style={{ fontSize: 13, color: "var(--txt-3)", lineHeight: 1.5, maxWidth: "60ch" }}>
              Clears every model-vs-model exhibition and resets each model's Elo to the baseline — a clean slate for the <Link to="/vs-ai" style={{ color: "var(--v-ac)", textDecoration: "none" }}>Humans vs AI</Link> board. Human matches and ratings are untouched.
            </div>
            {resetMsg && <div style={{ marginTop: 10, fontSize: 13, color: resetMsg.startsWith("✓") ? "var(--v-ac)" : "var(--v-wa)", fontFamily: "var(--mono)" }}>{resetMsg}</div>}
          </div>
          <button
            onClick={handleResetAiBoard}
            disabled={resetting}
            style={{
              flexShrink: 0, background: "transparent", color: "#a371f7", border: "1px solid #a371f7",
              fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, padding: "9px 18px", borderRadius: 8,
              cursor: resetting ? "not-allowed" : "pointer", opacity: resetting ? 0.6 : 1,
            }}
          >
            {resetting ? "Resetting…" : "Reset AI board"}
          </button>
        </div>
      </main>
    </div>
  );
}
