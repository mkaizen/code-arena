import { Link } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../ctx/AuthContext.js";

export function AdminPage() {
  const { user } = useAuth();

  if (!user || (user.role !== "ADMIN" && user.role !== "SETTER")) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--v-wa)", fontSize: 15 }}>Access denied — admins and setters only.</p>
      </div>
    );
  }

  const cards = [
    { to: "/admin/problems/new", title: "Create Problem", desc: "Write a new problem, add sample I/O and test cases." },
    { to: "/admin/contests/new", title: "Create Contest", desc: "Schedule a new rated or unrated contest." },
    { to: "/admin/contests/finalize", title: "Finalize Ratings", desc: "Run Elo recompute for a finished contest." },
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
      </main>
    </div>
  );
}
