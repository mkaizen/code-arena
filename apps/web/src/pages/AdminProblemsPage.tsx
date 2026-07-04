import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../ctx/AuthContext.js";
import { api, type AdminProblemRow } from "../api.js";

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  return "var(--v-wa)";
}

export function AdminProblemsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminProblems()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (!user || (user.role !== "ADMIN" && user.role !== "SETTER")) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--v-wa)", fontSize: 15 }}>Access denied — admins and setters only.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 900, margin: "0 auto", width: "100%", padding: "40px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)" }}>Manage Problems</h1>
          <Link to="/admin/problems/new" style={{ background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontFamily: "var(--disp)" }}>
            + New Problem
          </Link>
        </div>

        {loading && <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 48 }}>Loading…</div>}
        {error && <div style={{ color: "var(--v-wa)", padding: 16 }}>{error}</div>}

        {!loading && !error && (
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 70px", padding: "10px 16px", borderBottom: "1px solid var(--line)", fontSize: 10, letterSpacing: "0.05em", color: "var(--txt-3)", fontWeight: 600 }}>
              <span>TITLE</span><span>DIFF</span><span>RATING</span><span>TESTS</span>
            </div>
            {rows.map((p, i) => (
              <Link
                key={p.id}
                to={`/admin/problems/${p.id}/edit`}
                style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 70px", padding: "12px 16px", alignItems: "center", borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 13, textDecoration: "none", color: "var(--txt)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500 }}>{p.title}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)" }}>{p.slug}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: diffColor(p.difficulty) }}>
                  {p.difficulty === "easy" ? "Easy" : p.difficulty === "med" ? "Med" : "Hard"}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-2)" }}>{p.ratingValue}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: p.testCount > 0 ? "var(--txt-3)" : "var(--v-wa)" }}>{p.testCount}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
