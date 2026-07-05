import type { MatchStateView } from "@arena/shared";

const COLORS = {
  ink: "#0E1116",
  panel: "#161B22",
  line: "#262C36",
  txt: "#E6EDF3",
  txt2: "#8B949E",
  txt3: "#5C6571",
  ac: "#3FB950",
  wa: "#F85149",
};

const W = 1200;
const H = 630;

/** Draws a shareable PNG for a finished match, matching the app's own visual language. */
export function renderShareCard(match: MatchStateView, viewerUserId: string | undefined): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  const isDuel = match.mode === "DUEL";
  const me = match.players.find((p) => p.userId === viewerUserId) ?? match.players[0];
  const isDraw = match.players.filter((p) => p.placement === 1).length > 1;
  const won = me?.placement === 1 && !isDraw;

  // Wordmark
  ctx.font = "700 32px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText("Code", 64, 96);
  const codeWidth = ctx.measureText("Code").width;
  ctx.fillStyle = COLORS.ac;
  ctx.fillText("Arena", 64 + codeWidth, 96);

  ctx.font = "600 20px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt2;
  ctx.fillText(isDuel ? "1v1 Duel" : "Battle Royale", 64, 130);

  // Result headline
  ctx.textAlign = "center";
  ctx.font = "700 72px 'Space Grotesk', sans-serif";
  if (isDraw) {
    ctx.fillStyle = COLORS.txt;
    ctx.fillText("🤝 DRAW", W / 2, 300);
  } else if (won) {
    ctx.fillStyle = COLORS.ac;
    ctx.fillText("🏆 VICTORY", W / 2, 300);
  } else {
    ctx.fillStyle = COLORS.wa;
    ctx.fillText(me?.placement ? `#${me.placement} PLACE` : "DEFEAT", W / 2, 300);
  }

  // Handle + rating delta
  ctx.font = "700 40px 'JetBrains Mono', monospace";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText(me?.handle ?? "", W / 2, 380);

  if (me?.ratingBefore != null && me?.ratingAfter != null) {
    const delta = me.ratingAfter - me.ratingBefore;
    ctx.font = "600 26px 'JetBrains Mono', monospace";
    ctx.fillStyle = delta >= 0 ? COLORS.ac : COLORS.wa;
    ctx.fillText(`${delta >= 0 ? "+" : ""}${delta} rating → ${me.ratingAfter}`, W / 2, 425);
  }

  // Players row
  ctx.textAlign = "left";
  const rowY = 500;
  const cols = Math.min(match.players.length, 6);
  const colWidth = (W - 128) / cols;
  match.players.slice(0, cols).forEach((p, i) => {
    const x = 64 + i * colWidth;
    ctx.font = "700 18px 'JetBrains Mono', monospace";
    ctx.fillStyle = p.placement === 1 ? COLORS.ac : COLORS.txt2;
    ctx.fillText(p.handle.slice(0, 12), x, rowY);
    ctx.font = "500 13px 'Space Grotesk', sans-serif";
    ctx.fillStyle = COLORS.txt3;
    ctx.fillText(p.placement ? `#${p.placement}` : "—", x, rowY + 22);
  });

  ctx.textAlign = "center";
  ctx.font = "500 16px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt3;
  ctx.fillText("codearena.space", W / 2, H - 64);

  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
