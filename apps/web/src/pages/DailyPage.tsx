import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DailyView } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  if (d === "hard") return "var(--v-wa)";
  return "var(--txt-3)";
}

function diffLabel(d: string): string {
  return d === "easy" ? "Easy" : d === "med" ? "Medium" : d === "hard" ? "Hard" : d;
}

function prettyDate(iso: string): string {
  // iso is YYYY-MM-DD (UTC) — render in a stable, locale-free form.
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function DailyPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DailyView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.daily()
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Re-fetch when auth changes so streak state appears after login.
  }, [user]);

  const streak = data?.streak;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: "var(--txt)", margin: 0 }}>
            🔥 Daily Challenge
          </h1>
          {data && <span style={{ color: "var(--txt-3)", fontSize: 13, fontFamily: "var(--mono)" }}>{prettyDate(data.date)}</span>}
        </div>

        {error && <div style={{ color: "var(--v-wa)", padding: 16 }}>{error}</div>}
        {!error && !data && <div style={{ color: "var(--txt-3)", padding: 16 }}>Loading…</div>}

        {/* Streak summary */}
        {streak && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, color: streak.current > 0 ? "var(--v-tle)" : "var(--txt-3)" }}>
                  {streak.current}
                </span>
                <span style={{ fontSize: 22 }}>{streak.current > 0 ? "🔥" : "🧊"}</span>
              </div>
              <div style={{ color: "var(--txt-3)", fontSize: 12, marginTop: 2 }}>current streak</div>
            </div>
            <div style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, color: "var(--v-ac)" }}>{streak.longest}</span>
              <div style={{ color: "var(--txt-3)", fontSize: 12, marginTop: 2 }}>longest streak</div>
            </div>
          </div>
        )}

        {/* Today's problem */}
        {data?.problem ? (
          <Link
            to={`/problems/${data.problem.slug}`}
            style={{
              display: "block", textDecoration: "none",
              background: "var(--panel)", border: `1px solid ${streak?.solvedToday ? "var(--v-ac)" : "var(--line)"}`,
              borderRadius: 12, padding: "22px 24px", marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--v-tle)", fontFamily: "var(--disp)" }}>
                TODAY'S PROBLEM
              </span>
              {streak?.solvedToday && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--v-ac)" }}>✓ Solved</span>
              )}
            </div>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 700, color: "var(--txt)", margin: "0 0 8px" }}>
              {data.problem.title}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: diffColor(data.problem.difficulty) }}>{diffLabel(data.problem.difficulty)}</span>
              <span style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)" }}>rating {data.problem.ratingValue}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--v-ac)", fontFamily: "var(--disp)" }}>
                {streak?.solvedToday ? "Review →" : "Solve it →"}
              </span>
            </div>
          </Link>
        ) : data && (
          <div style={{ color: "var(--txt-3)", padding: 16 }}>No problems available yet.</div>
        )}

        {/* Calendar (last 14 days) */}
        {data?.calendar && (
          <div>
            <h3 style={{ fontFamily: "var(--disp)", fontSize: 14, fontWeight: 600, color: "var(--txt-2)", marginBottom: 10 }}>
              Last {data.calendar.length} days
            </h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.calendar.map((c) => (
                <div
                  key={c.date}
                  title={`${prettyDate(c.date)}${c.solved ? " — solved" : ""}`}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: c.solved ? "var(--v-ac)" : "var(--panel-2)",
                    border: `1px solid ${c.solved ? "var(--v-ac)" : "var(--line)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--mono)", fontSize: 11,
                    color: c.solved ? "#06210C" : "var(--txt-3)", fontWeight: 700,
                  }}
                >
                  {Number(c.date.slice(8, 10))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logged-out nudge */}
        {data && !streak && (
          <div style={{ marginTop: 20, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 22px", color: "var(--txt-2)", fontSize: 14 }}>
            <Link to="/login" style={{ color: "var(--v-ac)", fontWeight: 700 }}>Sign in</Link> to start a streak — solve the daily problem every day to keep it alive.
          </div>
        )}
      </main>
    </div>
  );
}
