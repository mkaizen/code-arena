import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";

type Difficulty = "easy" | "med" | "hard";
type Model = { key: string; name: string };

const DIFFS: { key: Difficulty; label: string; blurb: string }[] = [
  { key: "easy", label: "Easy", blurb: "Thinks a while, one shot — a beatable warm-up." },
  { key: "med", label: "Medium", blurb: "The arena default: iterates a couple of times." },
  { key: "hard", label: "Hard", blurb: "Full effort, no head start. You'll probably lose." },
];

const VIOLET = "rgba(126,90,255,";

/**
 * "Challenge the AI" entry point: pick an opponent from the model roster and a
 * difficulty, then start a live duel — no signup required (a throwaway guest
 * session is minted on the fly for logged-out visitors). Renders nothing when
 * the feature isn't configured on the server.
 */
export function ChallengeAi({ compact = false }: { compact?: boolean }) {
  const { user, ensureGuest } = useAuth();
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("med");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.aiConfig()
      .then((c) => {
        if (!alive) return;
        setEnabled(c.enabled);
        const roster = c.models?.length ? c.models : c.opponent ? [{ key: "", name: c.opponent }] : [];
        setModels(roster);
        setModelKey(roster[0]?.key ?? null);
      })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, []);

  if (enabled === null || enabled === false) return null; // loading or unavailable — show nothing

  const selected = models.find((m) => m.key === modelKey) ?? models[0];
  const name = selected?.name ?? "the AI";

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      if (!user) await ensureGuest();
      const { matchId } = await api.startAiDuel(difficulty, modelKey || undefined);
      navigate(`/battle/${matchId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${VIOLET}0.10), var(--panel))`,
        border: `1px solid ${VIOLET}0.35)`,
        borderRadius: 12,
        padding: compact ? "22px 24px" : "28px 30px",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontFamily: "var(--disp)", fontSize: compact ? 17 : 20, fontWeight: 700, color: "var(--txt)", marginBottom: 4 }}>
        🤖 Challenge {name}
      </h2>
      <p style={{ color: "var(--txt-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 16, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
        A live 1v1 duel against an AI that writes <strong>real code</strong>, judged on the same hidden
        tests you get. Pick your opponent. No signup — jump straight in.
      </p>

      {/* Opponent roster — only worth showing when there's a choice. */}
      {models.length > 1 && (
        <>
          <Label>Opponent</Label>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {models.map((m) => (
              <Chip key={m.key} on={m.key === modelKey} onClick={() => setModelKey(m.key)}>
                🤖 {m.name}
              </Chip>
            ))}
          </div>
        </>
      )}

      <Label>Difficulty</Label>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {DIFFS.map((d) => (
          <Chip key={d.key} on={difficulty === d.key} onClick={() => setDifficulty(d.key)} title={d.blurb}>
            {d.label}
          </Chip>
        ))}
      </div>
      <div style={{ color: "var(--txt-3)", fontSize: 11, marginBottom: 16, minHeight: 14 }}>
        {DIFFS.find((d) => d.key === difficulty)?.blurb}
      </div>

      {error && <div style={{ color: "var(--v-wa)", fontSize: 12, marginBottom: 12 }}>{error}</div>}

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

      {!compact && (
        <div style={{ marginTop: 14 }}>
          <Link to="/vs-ai" style={{ color: "var(--txt-3)", fontSize: 12, textDecoration: "none", fontFamily: "var(--disp)", fontWeight: 600 }}>
            See the leaderboard →
          </Link>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--txt-3)", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: on ? `${VIOLET}0.22)` : "transparent",
        border: `1px solid ${on ? `${VIOLET}0.7)` : "var(--line)"}`,
        color: on ? "var(--txt)" : "var(--txt-3)",
        fontWeight: 700, fontSize: 12, padding: "7px 16px", borderRadius: 8,
        cursor: "pointer", fontFamily: "var(--disp)",
      }}
    >
      {children}
    </button>
  );
}
