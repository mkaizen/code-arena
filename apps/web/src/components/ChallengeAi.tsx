import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

type Difficulty = "easy" | "med" | "hard";

const DIFFS: { key: Difficulty; label: string; blurb: string }[] = [
  { key: "easy", label: "Easy", blurb: "Thinks a while, one shot — a beatable warm-up." },
  { key: "med", label: "Medium", blurb: "The arena default: iterates a couple of times." },
  { key: "hard", label: "Hard", blurb: "Full effort, no head start. You'll probably lose." },
];

/**
 * "Challenge the AI" entry point: pick a difficulty and start a live duel
 * against the LLM opponent — no signup required (a throwaway guest session is
 * minted on the fly for logged-out visitors). Renders nothing when the feature
 * isn't configured on the server.
 */
export function ChallengeAi({ compact = false }: { compact?: boolean }) {
  const { user, ensureGuest } = useAuth();
  const navigate = useNavigate();
  const [opponent, setOpponent] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("med");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.aiConfig()
      .then((c) => { if (alive) { setEnabled(c.enabled); setOpponent(c.opponent); } })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, []);

  if (enabled === null || enabled === false) return null; // loading or unavailable — show nothing

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      if (!user) await ensureGuest();
      const { matchId } = await api.startAiDuel(difficulty);
      navigate(`/battle/${matchId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  const name = opponent ?? "the AI";

  return (
    <div
      style={{
        background: "linear-gradient(145deg, rgba(126,90,255,0.10), var(--panel))",
        border: "1px solid rgba(126,90,255,0.35)",
        borderRadius: 12,
        padding: compact ? "22px 24px" : "28px 30px",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontFamily: "var(--disp)", fontSize: compact ? 17 : 20, fontWeight: 700, color: "var(--txt)", marginBottom: 4 }}>
        🤖 Challenge {name}
      </h2>
      <p style={{ color: "var(--txt-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 16, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        A live 1v1 duel against an AI that writes <strong>real code</strong>, judged on the same hidden
        tests you get. No signup — jump straight in. Can you out-code it?
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
        {DIFFS.map((d) => {
          const on = difficulty === d.key;
          return (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              title={d.blurb}
              style={{
                background: on ? "rgba(126,90,255,0.22)" : "transparent",
                border: `1px solid ${on ? "rgba(126,90,255,0.7)" : "var(--line)"}`,
                color: on ? "var(--txt)" : "var(--txt-3)",
                fontWeight: 700, fontSize: 12, padding: "7px 16px", borderRadius: 8,
                cursor: "pointer", fontFamily: "var(--disp)",
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div style={{ color: "var(--txt-3)", fontSize: 11, marginBottom: 16, minHeight: 14 }}>
        {DIFFS.find((d) => d.key === difficulty)?.blurb}
      </div>

      {error && (
        <div style={{ color: "var(--v-wa)", fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}

      <button
        onClick={handleStart}
        disabled={starting}
        style={{
          background: "#7e5aff", color: "#fff", fontWeight: 700, fontSize: 14,
          padding: "11px 28px", border: "none", borderRadius: 8,
          cursor: starting ? "not-allowed" : "pointer", fontFamily: "var(--disp)", opacity: starting ? 0.7 : 1,
        }}
      >
        {starting ? "Starting…" : `Challenge ${name} →`}
      </button>
    </div>
  );
}
