import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { RECRUITER_THRESHOLD, tierOf, type MatchHistoryEntry, type MatchRecord } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api, type Submission } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

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
    TIME_LIMIT_EXCEEDED: "TLE",
    MEMORY_LIMIT_EXCEEDED: "MLE",
    RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compile Error",
    INTERNAL_ERROR: "Internal Error",
    PENDING: "Pending",
    JUDGING: "Judging",
  };
  return map[verdict] ?? verdict;
}

const LANG_LABELS: Record<string, string> = {
  cpp: "C++17", py: "Python 3", java: "Java 17", js: "JavaScript", go: "Go", rs: "Rust",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ProfilePage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState(0);
  const [recruiter, setRecruiter] = useState(false);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.submissions()
      .then(setSubmissions)
      .catch(() => {})
      .finally(() => setLoading(false));
    api.matchHistory()
      .then((h) => { setRecord(h.record); setMatches(h.matches); })
      .catch(() => {});
    api.userProfile(user.handle)
      .then((p) => { setReferrals(p.referrals); setRecruiter(p.recruiter); setStreak(p.currentStreak); })
      .catch(() => {});
  }, [user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const tier = tierOf(user.rating);
  const solved = new Set(submissions.filter((s) => s.verdict === "ACCEPTED").map((s) => s.problemId)).size;
  const totalSubs = submissions.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 800, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        {/* Profile header */}
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "28px 32px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Avatar placeholder */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--panel-2)",
              border: `2px solid ${tier.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--disp)",
              fontSize: 24,
              fontWeight: 700,
              color: tier.color,
              flexShrink: 0,
            }}
          >
            {user.handle.charAt(0).toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
              <h1
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  color: tier.color,
                  margin: 0,
                }}
              >
                {user.handle}
              </h1>
              <span
                style={{
                  fontFamily: "var(--disp)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: "var(--panel-2)",
                  color: tier.color,
                  border: `1px solid var(--line)`,
                }}
              >
                {tier.name}
              </span>
            </div>

            <div style={{ display: "flex", gap: 24, color: "var(--txt-2)", fontSize: 13 }}>
              <div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: tier.color }}>
                  {user.rating}
                </span>
                <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>rating</span>
              </div>
              <div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--v-ac)" }}>
                  {solved}
                </span>
                <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>solved</span>
              </div>
              <div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--txt-2)" }}>
                  {totalSubs}
                </span>
                <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>submissions</span>
              </div>
              {record && record.played > 0 && (
                <div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700 }}>
                    <span style={{ color: "var(--v-ac)" }}>{record.wins}</span>
                    <span style={{ color: "var(--txt-3)" }}>–</span>
                    <span style={{ color: "var(--v-wa)" }}>{record.losses}</span>
                  </span>
                  <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>match W–L</span>
                </div>
              )}
              {streak > 0 && (
                <div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--v-tle)" }}>
                    {streak}🔥
                  </span>
                  <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>day streak</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invite Friends */}
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 600, color: "var(--txt)", margin: 0 }}>
              Invite Friends
            </h2>
            {recruiter && (
              <span
                style={{
                  fontFamily: "var(--disp)",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: "rgba(0,255,140,0.1)",
                  color: "var(--v-ac)",
                  border: "1px solid var(--v-ac)",
                }}
              >
                🏅 Recruiter
              </span>
            )}
          </div>
          <p style={{ color: "var(--txt-2)", fontSize: 13, marginBottom: 14 }}>
            Invite {RECRUITER_THRESHOLD} friends to unlock the Recruiter badge and jump the matchmaking queue.
            {" "}
            <span style={{ color: "var(--v-ac)", fontWeight: 700 }}>{referrals}</span>
            <span style={{ color: "var(--txt-3)" }}>/{RECRUITER_THRESHOLD} invited</span>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={`${window.location.origin}/login?ref=${user.handle}`}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: 1,
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                color: "var(--txt-2)",
                fontSize: 13,
                fontFamily: "var(--mono)",
                padding: "9px 12px",
                minWidth: 0,
              }}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/login?ref=${user.handle}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{
                background: "var(--v-ac)",
                color: "#06210C",
                fontWeight: 700,
                fontSize: 13,
                padding: "9px 16px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--disp)",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        {/* Match History */}
        {matches.length > 0 && (
          <>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 600, color: "var(--txt)", marginBottom: 12 }}>
              Match History
            </h2>
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
              {matches.map((m, i) => {
                const delta = m.ratingBefore != null && m.ratingAfter != null ? m.ratingAfter - m.ratingBefore : null;
                const place = m.placement != null ? (m.mode === "DUEL" ? (m.won ? "Win" : "Loss") : `#${m.placement} / ${m.playerCount}`) : "—";
                return (
                  <div
                    key={m.matchId}
                    style={{
                      display: "grid", gridTemplateColumns: "90px 1fr 90px 70px", gap: 8, padding: "10px 16px", alignItems: "center",
                      borderBottom: i < matches.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 13,
                    }}
                  >
                    <span style={{ fontFamily: "var(--disp)", fontSize: 11, fontWeight: 700, color: m.mode === "DUEL" ? "var(--v-tle)" : "var(--v-ac)" }}>
                      {m.mode === "DUEL" ? "1v1 Duel" : "Royale"}
                    </span>
                    <span style={{ color: m.won ? "var(--v-ac)" : "var(--txt-2)", fontWeight: 600 }}>
                      {m.won ? "🏆 " : ""}{place}
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: delta == null ? "var(--txt-3)" : delta >= 0 ? "var(--v-ac)" : "var(--v-wa)" }}>
                      {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}`}
                    </span>
                    <span style={{ color: "var(--txt-3)", fontSize: 11, textAlign: "right" }}>
                      {m.endedAt ? timeAgo(m.endedAt) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recent Submissions */}
        <h2
          style={{
            fontFamily: "var(--disp)",
            fontSize: 16,
            fontWeight: 600,
            color: "var(--txt)",
            marginBottom: 12,
          }}
        >
          Recent Submissions
        </h2>

        {loading ? (
          <div style={{ color: "var(--txt-3)", padding: 16 }}>Loading…</div>
        ) : submissions.length === 0 ? (
          <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 32 }}>No submissions yet.</div>
        ) : (
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 100px 80px",
                padding: "8px 16px",
                borderBottom: "1px solid var(--line)",
                fontSize: 10,
                letterSpacing: "0.05em",
                color: "var(--txt-3)",
                fontWeight: 600,
              }}
            >
              <span>PROBLEM</span>
              <span>VERDICT</span>
              <span>LANGUAGE</span>
              <span>TIME</span>
            </div>

            {submissions.slice(0, 50).map((sub, i) => (
              <div
                key={sub.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 100px 80px",
                  padding: "10px 16px",
                  alignItems: "center",
                  borderBottom: i < Math.min(submissions.length, 50) - 1 ? "1px solid var(--line-soft)" : "none",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    color: "var(--txt-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sub.problemId.slice(0, 12)}…
                </span>
                <span style={{ color: verdictColor(sub.verdict), fontWeight: 700, fontSize: 12 }}>
                  {verdictLabel(sub.verdict)}
                </span>
                <span style={{ color: "var(--txt-3)", fontSize: 12 }}>
                  {LANG_LABELS[sub.language] ?? sub.language}
                </span>
                <span style={{ color: "var(--txt-3)", fontSize: 11 }}>
                  {timeAgo(sub.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
