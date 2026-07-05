import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { tierOf, type PublicProfile } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Stat({ value, label, color }: { value: React.ReactNode; label: string; color?: string }) {
  return (
    <div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: color ?? "var(--txt-2)" }}>{value}</span>
      <span style={{ marginLeft: 6, color: "var(--txt-3)", fontSize: 12 }}>{label}</span>
    </div>
  );
}

export function UserProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    setError("");
    api.userProfile(handle)
      .then(setProfile)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [handle]);

  const tier = profile ? tierOf(profile.rating) : null;
  const isMe = !!profile && user?.handle === profile.handle;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 800, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        {loading && <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 48 }}>Loading…</div>}
        {error && <div style={{ color: "var(--v-wa)", textAlign: "center", padding: 48 }}>{error}</div>}

        {profile && tier && (
          <>
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "28px 32px", marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--panel-2)", border: `2px solid ${tier.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--disp)", fontSize: 24, fontWeight: 700, color: tier.color, flexShrink: 0 }}>
                {profile.handle.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                  <h1 style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: tier.color, margin: 0 }}>{profile.handle}</h1>
                  <span style={{ fontFamily: "var(--disp)", fontSize: 13, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "var(--panel-2)", color: tier.color, border: "1px solid var(--line)" }}>{tier.name}</span>
                  {isMe && <span style={{ fontSize: 11, color: "var(--txt-3)" }}>(you)</span>}
                  {profile.recruiter && (
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
                <div style={{ display: "flex", gap: 24, color: "var(--txt-2)", fontSize: 13, flexWrap: "wrap" }}>
                  <Stat value={profile.rating} label="rating" color={tier.color} />
                  <Stat value={profile.solved} label="solved" color="var(--v-ac)" />
                  <Stat value={profile.submissions} label="submissions" />
                  {profile.record.played > 0 && (
                    <Stat
                      value={<><span style={{ color: "var(--v-ac)" }}>{profile.record.wins}</span><span style={{ color: "var(--txt-3)" }}>–</span><span style={{ color: "var(--v-wa)" }}>{profile.record.losses}</span></>}
                      label="match W–L"
                    />
                  )}
                </div>
                <div style={{ color: "var(--txt-3)", fontSize: 12, marginTop: 8 }}>Joined {timeAgo(profile.joinedAt)}</div>
              </div>
            </div>

            <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 600, color: "var(--txt)", marginBottom: 12 }}>Recent Matches</h2>
            {profile.recentMatches.length === 0 ? (
              <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 32 }}>No matches played yet.</div>
            ) : (
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                {profile.recentMatches.map((m, i) => {
                  const delta = m.ratingBefore != null && m.ratingAfter != null ? m.ratingAfter - m.ratingBefore : null;
                  const place = m.placement != null ? (m.mode === "DUEL" ? (m.won ? "Win" : "Loss") : `#${m.placement} / ${m.playerCount}`) : "—";
                  return (
                    <div key={m.matchId} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 70px", gap: 8, padding: "10px 16px", alignItems: "center", borderBottom: i < profile.recentMatches.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 13 }}>
                      <span style={{ fontFamily: "var(--disp)", fontSize: 11, fontWeight: 700, color: m.mode === "DUEL" ? "var(--v-tle)" : "var(--v-ac)" }}>{m.mode === "DUEL" ? "1v1 Duel" : "Royale"}</span>
                      <span style={{ color: m.won ? "var(--v-ac)" : "var(--txt-2)", fontWeight: 600 }}>{m.won ? "🏆 " : ""}{place}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: delta == null ? "var(--txt-3)" : delta >= 0 ? "var(--v-ac)" : "var(--v-wa)" }}>{delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}`}</span>
                      <span style={{ color: "var(--txt-3)", fontSize: 11, textAlign: "right" }}>{m.endedAt ? timeAgo(m.endedAt) : ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
