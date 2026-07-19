import { MODE_LABELS, type MatchStateView } from "@arena/shared";

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

// ── Canvas helpers ──────────────────────────────────────────────────────────

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A soft radial wash of `rgb` (e.g. "63,185,80") centred at (cx, cy). */
function glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Shared backdrop: dark base, accent wash, faint dot-grid, rounded accent frame. */
function drawBackdrop(ctx: CanvasRenderingContext2D, rgb: string, secondRgb?: string) {
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#12161D");
  base.addColorStop(1, COLORS.ink);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W - 120, 70, 620, rgb, 0.3);
  if (secondRgb) glow(ctx, 120, H - 40, 520, secondRgb, 0.22);

  // Faint dot-grid texture.
  ctx.fillStyle = "rgba(255,255,255,0.028)";
  for (let y = 80; y < H - 40; y += 28) {
    for (let x = 60; x < W - 40; x += 28) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Rounded frame with an accent edge.
  roundRectPath(ctx, 28, 28, W - 56, H - 56, 26);
  ctx.fillStyle = "rgba(11,14,19,0.35)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${rgb},0.55)`;
  ctx.stroke();
}

function drawWordmark(ctx: CanvasRenderingContext2D, sub: string) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 30px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText("Code", 66, 92);
  ctx.fillStyle = COLORS.ac;
  ctx.fillText("Arena", 66 + ctx.measureText("Code").width, 92);

  ctx.font = "600 17px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt3;
  ctx.textAlign = "right";
  ctx.fillText(sub.toUpperCase(), W - 66, 88);
}

/** Draws a shareable PNG for a finished match — bold, outcome-coloured, thumbnail-legible. */
export function renderShareCard(match: MatchStateView, viewerUserId: string | undefined): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const me = match.players.find((p) => p.userId === viewerUserId) ?? match.players[0];
  const isDraw = match.players.filter((p) => p.placement === 1).length > 1;
  const won = me?.placement === 1 && !isDraw;
  // In a "Challenge the AI" duel the opponent is the bot player — frame the
  // headline around the matchup so a shared card reads "I beat the AI".
  const aiOpponent = match.aiDuel ? match.players.find((p) => p.isBot) : undefined;

  // Outcome accent: green win / red loss / amber draw. AI duels add a violet wash.
  const AMBER = "227,160,8";
  const GREEN = "63,185,80";
  const RED = "248,81,73";
  const VIOLET = "163,113,247";
  const rgb = isDraw ? AMBER : won ? GREEN : RED;
  const accentHex = isDraw ? "#E3A008" : won ? COLORS.ac : COLORS.wa;

  drawBackdrop(ctx, rgb, aiOpponent ? VIOLET : undefined);
  drawWordmark(ctx, aiOpponent ? "Challenge the AI" : MODE_LABELS[match.mode]);

  const badge = isDraw ? "🤝" : won ? "🏆" : aiOpponent ? "🤖" : "💀";
  const headline = isDraw
    ? "DRAW"
    : won
      ? aiOpponent ? "I BEAT THE AI" : "VICTORY"
      : aiOpponent ? "THE AI WON" : me?.placement ? `#${me.placement} PLACE` : "DEFEAT";

  // Medal disc.
  ctx.textAlign = "center";
  const discY = 196;
  roundRectPath(ctx, W / 2 - 52, discY - 52, 104, 104, 52);
  ctx.fillStyle = `rgba(${rgb},0.14)`;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${rgb},0.6)`;
  ctx.stroke();
  ctx.font = "700 58px 'Space Grotesk', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, W / 2, discY + 4);
  ctx.textBaseline = "alphabetic";

  // Headline with a glow.
  ctx.font = "700 74px 'Space Grotesk', sans-serif";
  ctx.fillStyle = accentHex;
  ctx.shadowColor = `rgba(${rgb},0.55)`;
  ctx.shadowBlur = 34;
  ctx.fillText(headline, W / 2, 330);
  ctx.shadowBlur = 0;

  // Matchup / handle.
  ctx.font = "700 34px 'JetBrains Mono', monospace";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText(
    aiOpponent ? `${trunc(me?.handle ?? "you", 16)}  vs  🤖 ${trunc(aiOpponent.handle, 16)}` : trunc(me?.handle ?? "", 22),
    W / 2,
    374,
  );

  // Rating delta as a pill.
  const hasRating = me?.ratingBefore != null && me?.ratingAfter != null;
  if (hasRating) {
    const delta = me!.ratingAfter! - me!.ratingBefore!;
    const up = delta >= 0;
    const label = `${up ? "▲ +" : "▼ "}${delta}   →   ${me!.ratingAfter}`;
    ctx.font = "700 24px 'JetBrains Mono', monospace";
    const pw = ctx.measureText(label).width + 44;
    const px = W / 2 - pw / 2;
    roundRectPath(ctx, px, 398, pw, 46, 23);
    ctx.fillStyle = up ? "rgba(63,185,80,0.14)" : "rgba(248,81,73,0.14)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = up ? "rgba(63,185,80,0.5)" : "rgba(248,81,73,0.5)";
    ctx.stroke();
    ctx.fillStyle = up ? COLORS.ac : COLORS.wa;
    ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, 422);
    ctx.textBaseline = "alphabetic";
  }

  // Player chips — the field, winner highlighted.
  const shown = match.players.slice(0, 6);
  ctx.font = "700 20px 'JetBrains Mono', monospace";
  const chipH = 50, padX = 18, gap = 12, rankGap = 12;
  const chip = shown.map((p) => {
    const rankTxt = p.placement ? `#${p.placement}` : "—";
    ctx.font = "700 15px 'Space Grotesk', sans-serif";
    const rankW = ctx.measureText(rankTxt).width;
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    const nameW = ctx.measureText(trunc(p.handle, 12)).width;
    return { p, rankTxt, rankW, nameW, w: padX * 2 + rankW + rankGap + nameW };
  });
  const totalW = chip.reduce((a, c) => a + c.w, 0) + gap * (shown.length - 1);
  let x = W / 2 - totalW / 2;
  const cy = hasRating ? 500 : 462;
  for (const c of chip) {
    const winner = c.p.placement === 1 && !isDraw;
    roundRectPath(ctx, x, cy, c.w, chipH, 12);
    ctx.fillStyle = winner ? `rgba(${rgb},0.16)` : "rgba(255,255,255,0.045)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = winner ? `rgba(${rgb},0.7)` : COLORS.line;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 15px 'Space Grotesk', sans-serif";
    ctx.fillStyle = winner ? accentHex : COLORS.txt3;
    ctx.fillText(c.rankTxt, x + padX, cy + chipH / 2 + 1);
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    ctx.fillStyle = winner ? COLORS.txt : COLORS.txt2;
    ctx.fillText(trunc(c.p.handle, 12), x + padX + c.rankW + rankGap, cy + chipH / 2 + 1);
    ctx.textBaseline = "alphabetic";
    x += c.w + gap;
  }

  // Footer.
  ctx.textAlign = "center";
  ctx.font = "600 17px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt3;
  ctx.fillText("codearena.space  ·  Solve. Duel. Climb.", W / 2, H - 42);

  return canvas;
}

/** Draws a shareable PNG celebrating a daily-challenge streak. */
export function renderStreakCard(handle: string, current: number, longest: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Wordmark
  ctx.textAlign = "left";
  ctx.font = "700 32px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText("Code", 64, 96);
  const codeWidth = ctx.measureText("Code").width;
  ctx.fillStyle = COLORS.ac;
  ctx.fillText("Arena", 64 + codeWidth, 96);

  ctx.font = "600 20px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt2;
  ctx.fillText("Daily Challenge", 64, 130);

  // Big flame + streak number
  ctx.textAlign = "center";
  ctx.font = "700 110px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText(`🔥 ${current}`, W / 2, 320);

  ctx.font = "700 34px 'Space Grotesk', sans-serif";
  ctx.fillStyle = "#E3A008"; // warm streak accent
  ctx.fillText(`DAY STREAK`, W / 2, 375);

  // Handle + longest
  ctx.font = "700 40px 'JetBrains Mono', monospace";
  ctx.fillStyle = COLORS.txt;
  ctx.fillText(`@${handle}`, W / 2, 455);

  ctx.font = "500 22px 'Space Grotesk', sans-serif";
  ctx.fillStyle = COLORS.txt2;
  ctx.fillText(`Longest streak: ${longest} ${longest === 1 ? "day" : "days"}`, W / 2, 500);

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
