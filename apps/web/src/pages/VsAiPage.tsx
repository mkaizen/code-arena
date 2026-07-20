import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { TopBar } from "../components/TopBar.js";
import { ChallengeAi } from "../components/ChallengeAi.js";
import { useSeo } from "../hooks/useSeo.js";
import { api, type AiLeaderboard } from "../api.js";

// The AI feature's accent — a violet that sets these pages apart from the
// green competitive ladder while staying in the same palette.
const AI = "#a371f7";
const AI_SOFT = "rgba(163,113,247,0.14)";

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function VsAiPage() {
  const [data, setData] = useState<AiLeaderboard | null>(null);
  const [error, setError] = useState("");

  useSeo({
    title: "Humans vs AI — Can You Out-Code the AI?",
    description:
      "A live 1v1 coding leaderboard: humans vs an AI that writes real code judged on the same hidden tests. See the AI's win rate against human players and the roster of people who've beaten it.",
    path: "/vs-ai",
  });

  useEffect(() => {
    api.aiLeaderboard().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const loading = !data && !error;
  const models = data?.models ?? [];
  const champions = data?.champions ?? [];
  const standings = data?.aiVsAi ?? [];

  const totalDuels = models.reduce((s, m) => s + m.played, 0);
  const totalHumanWins = models.reduce((s, m) => s + m.humanWins, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "28px 20px 64px" }}>
        {/* Hero */}
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 16,
            border: `1px solid ${AI_SOFT}`,
            background: `radial-gradient(120% 140% at 0% 0%, ${AI_SOFT} 0%, transparent 55%), var(--panel)`,
            padding: "30px 28px",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: AI, background: AI_SOFT, border: `1px solid ${AI_SOFT}`,
                padding: "4px 10px", borderRadius: 999,
              }}
            >
              🤖 Live leaderboard
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--disp)", fontSize: "clamp(1.7rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--txt)", margin: "0 0 10px" }}>
            Humans <span style={{ color: "var(--txt-3)" }}>vs</span> <span style={{ color: AI }}>AI</span>
          </h1>
          <p style={{ color: "var(--txt-2)", fontSize: 14.5, lineHeight: 1.65, maxWidth: "58ch", margin: 0 }}>
            Every duel is real: the AI reads the same problem you do, writes actual code, and it's judged on the
            same hidden tests. Here's how it's holding up against human players — and who's taken it down.
          </p>

          {/* Aggregate scoreboard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 22 }}>
            <HeroStat label="Duels played" value={loading ? "—" : totalDuels.toLocaleString()} />
            <HeroStat label="Human win rate" value={loading ? "—" : `${pct(totalHumanWins, totalDuels)}%`} accent />
            <HeroStat label="Players who've won" value={loading ? "—" : champions.length.toLocaleString()} />
          </div>
        </section>

        {/* Challenge CTA */}
        <div style={{ marginBottom: 28 }}>
          <ChallengeAi compact />
        </div>

        {error && (
          <div style={{ color: "var(--v-wa)", padding: 16, background: "rgba(255,92,92,0.1)", borderRadius: 10, border: "1px solid rgba(255,92,92,0.2)", marginBottom: 20, fontSize: 13 }}>
            Couldn't load the leaderboard: {error}
          </div>
        )}

        {loading && <div style={{ color: "var(--txt-3)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading the standings…</div>}

        {!loading && !error && (
          <>
            {/* Per-model record vs humans */}
            <Section
              eyebrow="// the scoreboard"
              title={models.length > 1 ? "Each model's record vs humans" : "The AI's record"}
            >
              {models.length === 0 ? (
                <Empty>No duels played yet — be the first to challenge it.</Empty>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {models.map((m) => {
                    const humanRate = pct(m.humanWins, m.played);
                    return (
                      <div key={m.name} style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--txt)" }}>
                            <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, background: AI_SOFT, display: "grid", placeItems: "center", fontSize: 16 }}>🤖</span>
                            {m.name}
                          </span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)" }}>
                            {m.played} duel{m.played === 1 ? "" : "s"}
                          </span>
                        </div>

                        {/* Win-split bar: humans (green) vs AI (red) */}
                        <SplitBar humanWins={m.humanWins} aiWins={m.aiWins} draws={m.draws} played={m.played} />

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                          <Legend swatch="var(--v-ac)" label="Humans" value={`${m.humanWins} · ${humanRate}%`} />
                          {m.draws > 0 && <Legend swatch="var(--txt-3)" label="Draws" value={String(m.draws)} />}
                          <Legend swatch="var(--v-wa)" label="AI" value={`${m.aiWins} · ${pct(m.aiWins, m.played)}%`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Model vs model */}
            {standings.length > 0 && (
              <Section
                eyebrow="// exhibition"
                title="Model vs model"
                sub="Head-to-head duels between models — same problems, same judge, both at full effort. Ranked by Elo (relative to this pool)."
              >
                <div style={list}>
                  {standings.map((s, i) => (
                    <Row key={s.name} rank={i}>
                      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, color: "var(--txt)" }}>
                        🤖 {s.name}
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)" }}>
                        {s.wins}<span style={{ color: "var(--txt-3)" }}>W</span> {s.losses}<span style={{ color: "var(--txt-3)" }}>L</span>{s.draws ? <> {s.draws}<span style={{ color: "var(--txt-3)" }}>D</span></> : null}
                      </span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 78, justifyContent: "flex-end" }}>
                        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 17, color: AI }}>{s.rating}</span>
                        <span style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--txt-3)" }}>ELO</span>
                      </span>
                    </Row>
                  ))}
                </div>
              </Section>
            )}

            {/* Hall of humans who beat the AI */}
            <Section eyebrow="// hall of fame" title="Humans who beat the AI">
              {champions.length === 0 ? (
                <Empty>Nobody's taken it down yet. Claim the first scalp.</Empty>
              ) : (
                <div style={list}>
                  {champions.map((c, i) => (
                    <Row key={c.handle} rank={i}>
                      <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.handle}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)" }}>{c.wins}/{c.games}</span>
                      <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: "var(--v-ac)", minWidth: 58, textAlign: "right" }}>
                        {c.wins} win{c.wins === 1 ? "" : "s"}
                      </span>
                    </Row>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

const card: CSSProperties = { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px" };
const list: CSSProperties = { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" };

function Section({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em", color: AI, marginBottom: 6 }}>{eyebrow}</div>
      <h2 style={{ fontFamily: "var(--disp)", fontSize: 18, fontWeight: 700, color: "var(--txt)", margin: 0 }}>{title}</h2>
      {sub && <p style={{ color: "var(--txt-3)", fontSize: 12.5, lineHeight: 1.5, margin: "6px 0 0", maxWidth: "60ch" }}>{sub}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.18)", border: "1px solid var(--line-soft)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 24, color: accent ? AI : "var(--txt)" }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--txt-3)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SplitBar({ humanWins, aiWins, draws, played }: { humanWins: number; aiWins: number; draws: number; played: number }) {
  const total = played || 1;
  const h = (humanWins / total) * 100;
  const d = (draws / total) * 100;
  const a = (aiWins / total) * 100;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--panel-2)" }}>
      <span style={{ width: `${h}%`, background: "var(--v-ac)" }} />
      <span style={{ width: `${d}%`, background: "var(--txt-3)" }} />
      <span style={{ width: `${a}%`, background: "var(--v-wa)" }} />
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch }} />
      <span style={{ color: "var(--txt-3)" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", color: "var(--txt-2)", fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function Row({ rank, children }: { rank: number; children: ReactNode }) {
  const medal = MEDALS[rank];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: rank === 0 ? "none" : "1px solid var(--line-soft)" }}>
      <span style={{ width: 24, textAlign: "center", fontFamily: "var(--mono)", fontSize: medal ? 15 : 12, fontWeight: 700, color: "var(--txt-3)" }}>
        {medal ?? rank + 1}
      </span>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...card, color: "var(--txt-3)", fontSize: 13, textAlign: "center", padding: "22px 20px" }}>
      {children}
    </div>
  );
}
