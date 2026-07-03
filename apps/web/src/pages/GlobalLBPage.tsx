import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tierOf } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api, type GlobalLBRow } from "../api.js";

export function GlobalLBPage() {
  const [rows, setRows] = useState<GlobalLBRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.globalLeaderboard()
      .then((r) => setRows(r.slice(0, 200)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 700, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        <h1
          style={{
            fontFamily: "var(--disp)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--txt)",
            marginBottom: 24,
          }}
        >
          Global Leaderboard
        </h1>

        {loading && (
          <div style={{ color: "var(--txt-2)", textAlign: "center", padding: 48 }}>Loading…</div>
        )}

        {error && (
          <div style={{ color: "var(--v-wa)", padding: 16, background: "rgba(255,92,92,0.1)", borderRadius: 8, border: "1px solid rgba(255,92,92,0.2)" }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 100px 120px",
                padding: "10px 16px",
                borderBottom: "1px solid var(--line)",
                fontSize: 10,
                letterSpacing: "0.05em",
                color: "var(--txt-3)",
                fontWeight: 600,
              }}
            >
              <span>#</span>
              <span>HANDLE</span>
              <span>RATING</span>
              <span>TIER</span>
            </div>

            {rows.length === 0 && (
              <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 32 }}>
                No users yet.
              </div>
            )}

            {rows.map((row, i) => {
              const tier = tierOf(row.rating);
              const isTop3 = i < 3;
              const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];

              return (
                <div
                  key={row.handle}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 100px 120px",
                    padding: "11px 16px",
                    alignItems: "center",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "none",
                    background: isTop3 ? "rgba(255,255,255,0.015)" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isTop3 ? "rgba(255,255,255,0.015)" : "transparent")}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                      fontWeight: isTop3 ? 700 : 500,
                      color: isTop3 ? rankColors[i] : "var(--txt-3)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <Link
                    to={`/u/${encodeURIComponent(row.handle)}`}
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: tier.color,
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                  >
                    {row.handle}
                  </Link>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: tier.color,
                    }}
                  >
                    {row.rating}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: tier.color,
                      fontFamily: "var(--disp)",
                      opacity: 0.85,
                    }}
                  >
                    {tier.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
