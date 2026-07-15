import { useEffect, useState } from "react";
import type { MatchPlayerView, MatchStateView } from "@arena/shared";

/**
 * Presentational helpers shared by the live-match screen and the read-only
 * spectator view, so verdict colours, the round clock, and player-status
 * labels read identically whether you're playing or watching.
 */

export function verdictColor(verdict: string): string {
  if (verdict === "ACCEPTED") return "var(--v-ac)";
  if (["WRONG_ANSWER", "RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"].includes(verdict)) return "var(--v-wa)";
  if (verdict === "TIME_LIMIT_EXCEEDED") return "var(--v-tle)";
  if (verdict === "COMPILATION_ERROR") return "var(--v-ce)";
  if (["PENDING", "JUDGING"].includes(verdict)) return "var(--v-judge)";
  return "var(--txt-2)";
}

export function verdictLabel(verdict: string): string {
  const map: Record<string, string> = {
    ACCEPTED: "Accepted", WRONG_ANSWER: "Wrong Answer", TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
    MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded", RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error", INTERNAL_ERROR: "Internal Error",
    PENDING: "Pending", JUDGING: "Judging…",
  };
  return map[verdict] ?? verdict;
}

export function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  return "var(--v-wa)";
}

export function RoundTimer({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const deadline = new Date(endsAt).getTime();
    function update() { setRemaining(Math.max(0, deadline - Date.now())); }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const critical = remaining < 30_000;
  const warn = remaining < 60_000;
  return (
    <div
      style={{
        fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700,
        color: critical ? "var(--v-wa)" : warn ? "var(--v-tle)" : "var(--txt)",
        animation: critical ? "flash 1s step-start infinite" : undefined,
      }}
    >
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}

export function playerStatus(p: MatchPlayerView, match: MatchStateView): { label: string; color: string } {
  const isDraw = match.status === "FINISHED" && match.players.filter((q) => q.placement === 1).length > 1;
  if (match.status === "FINISHED" && p.placement != null) {
    if (p.placement === 1 && isDraw) return { label: "🤝 Draw", color: "var(--v-tle)" };
    return { label: p.placement === 1 ? "🏆 Winner" : `#${p.placement}`, color: p.placement === 1 ? "var(--v-ac)" : "var(--txt-2)" };
  }
  if (p.forfeited) return { label: "Forfeited · left", color: "var(--v-wa)" };
  if (p.status === "ELIMINATED") return { label: `Eliminated · R${(p.eliminatedRound ?? 0) + 1}`, color: "var(--v-wa)" };
  if (p.solvedCurrentRound) return { label: "Solved ✓", color: "var(--v-ac)" };
  return { label: "Racing…", color: "var(--txt-3)" };
}
