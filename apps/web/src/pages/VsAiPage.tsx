import { useEffect, useState } from "react";
import { TopBar } from "../components/TopBar.js";
import { ChallengeAi } from "../components/ChallengeAi.js";
import { useSeo } from "../hooks/useSeo.js";
import { api, type AiLeaderboard } from "../api.js";

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

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

  const models = data?.models ?? [];
  const champions = data?.champions ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 760, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 26, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>
          Humans vs AI
        </h1>
        <p style={{ color: "var(--txt-3)", fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: "62ch" }}>
          Every "Challenge the AI" duel is real: the AI reads the same problem you do, writes actual
          code, and it's judged on the same hidden tests. Here's how it's doing against human
          players — and who's beaten it.
        </p>

        <div style={{ marginBottom: 28 }}>
          <ChallengeAi compact />
        </div>

        {error && (
          <div style={{ color: "var(--v-wa)", padding: 16, background: "rgba(255,92,92,0.1)", borderRadius: 8, border: "1px solid rgba(255,92,92,0.2)", marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Per-model record vs humans */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, color: "var(--txt)", marginBottom: 12 }}>
            The AI's record
          </h2>
          {models.length === 0 ? (
            <div style={{ color: "var(--txt-3)", fontSize: 13, padding: "16px 0" }}>
              No duels played yet. Be the first to challenge it.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {models.map((m) => (
                <div key={m.name} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)" }}>🤖 {m.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)" }}>{m.played} duel{m.played === 1 ? "" : "s"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center" }}>
                    <Stat label="AI wins" value={m.aiWins} tone="wa" />
                    <Stat label="Human wins" value={m.humanWins} tone="ac" />
                    <Stat label="Humans win" value={pct(m.humanWins, m.played)} tone="txt" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Hall of humans who beat the AI */}
        <section>
          <h2 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, color: "var(--txt)", marginBottom: 12 }}>
            Humans who beat the AI
          </h2>
          {champions.length === 0 ? (
            <div style={{ color: "var(--txt-3)", fontSize: 13, padding: "16px 0" }}>
              Nobody's taken it down yet. Claim the first scalp.
            </div>
          ) : (
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              {champions.map((c, i) => (
                <div key={c.handle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-3)", width: 28 }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 13, color: "var(--txt)" }}>{c.handle}</span>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: "var(--v-ac)" }}>
                    {c.wins} win{c.wins === 1 ? "" : "s"}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)", width: 64, textAlign: "right" }}>
                    {c.wins}/{c.games}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "ac" | "wa" | "txt" }) {
  const color = tone === "ac" ? "var(--v-ac)" : tone === "wa" ? "var(--v-wa)" : "var(--txt)";
  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 8, padding: "10px 6px" }}>
      <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 18, color }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--txt-3)", marginTop: 3 }}>{label}</div>
    </div>
  );
}
