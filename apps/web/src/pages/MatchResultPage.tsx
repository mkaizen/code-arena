import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { MatchStateView } from "@arena/shared";
import { api } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { renderShareCard, downloadCanvas } from "../shareCard.js";

export function MatchResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [match, setMatch] = useState<MatchStateView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!id) return;
    api.publicMatch(id).then(setMatch).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!match || !canvasRef.current) return;
    const card = renderShareCard(match, user?.id);
    const ctx = canvasRef.current.getContext("2d")!;
    canvasRef.current.width = card.width;
    canvasRef.current.height = card.height;
    ctx.drawImage(card, 0, 0);
  }, [match, user?.id]);

  function handleDownload() {
    if (!match) return;
    downloadCanvas(renderShareCard(match, user?.id), `codearena-${match.id.slice(0, 8)}.png`);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <Link to="/" style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18, color: "var(--txt)", textDecoration: "none", marginBottom: 32 }}>
        Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
      </Link>

      {error && <div style={{ color: "var(--v-wa)" }}>{error}</div>}
      {!error && !match && <div style={{ color: "var(--txt-3)" }}>Loading…</div>}

      {match && (
        <>
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--line)",
              marginBottom: 24,
            }}
          >
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleDownload}
              style={{
                background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
                padding: "10px 20px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "var(--disp)",
              }}
            >
              Download Image
            </button>
            <button
              onClick={handleCopyLink}
              style={{
                background: "var(--panel-2)", color: "var(--txt)", fontWeight: 600, fontSize: 14,
                padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer", fontFamily: "var(--disp)",
              }}
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>

          {match && (
            <Link to={`/replay/${match.id}`} style={{ marginTop: 18, color: "var(--v-ac)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              Watch the full replay →
            </Link>
          )}

          {/* Guests played with a throwaway account — convert them before the
              session evaporates. Tailored line for the AI-duel demo path. */}
          {user?.guest && (
            <div style={{ marginTop: 28, maxWidth: 480, textAlign: "center", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt)", marginBottom: 6 }}>
                {match.aiDuel ? "Want a rematch — and a rating?" : "Keep your progress"}
              </div>
              <p style={{ color: "var(--txt-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
                {match.aiDuel
                  ? "You just played as a guest. Create a free account to save your record against the AI, climb the ladder, and duel real players."
                  : "You're playing as a guest. Create a free account to save your rating and match history."}
              </p>
              <Link to="/login" style={{ display: "inline-block", background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: 8, textDecoration: "none", fontFamily: "var(--disp)" }}>
                Create a free account →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
