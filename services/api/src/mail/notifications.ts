import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { sendEmail } from "./mailer.js";
import { utcDate, streakAlive } from "../streak.js";

/** How long before a contest starts we send the reminder. */
const REMINDER_LEAD_MS = 60 * 60 * 1000; // 1 hour
/** Only nudge a lapsing streak once we're this far into the UTC day. */
const NUDGE_AFTER_UTC_HOUR = 16;

/** Lazily mints a stable unsubscribe token for a user. */
async function ensureNotifyToken(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = randomBytes(16).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { notifyToken: token } });
  return token;
}

function unsubscribeUrl(token: string): string {
  return `${env.API_BASE_URL}/notifications/unsubscribe?token=${token}`;
}

/** Wraps body content in a light, on-brand HTML shell with an unsubscribe footer. */
function layout(bodyHtml: string, unsubUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e9ee;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #eef1f4;">
          <span style="font-size:18px;font-weight:700;color:#0E1116;">Code<span style="color:#2ea043;">Arena</span></span>
        </td></tr>
        <tr><td style="padding:28px;color:#20262e;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #eef1f4;color:#8b949e;font-size:12px;">
          You're receiving this because you have an account at Code Arena.
          <a href="${unsubUrl}" style="color:#8b949e;">Unsubscribe from emails</a>.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#2ea043;color:#ffffff;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px;margin:8px 0;">${label}</a>`;
}

interface Recipient {
  id: string;
  email: string;
  handle: string;
  emailOptOut: boolean;
  notifyToken: string | null;
}

/** Sends a templated email to a user unless they've opted out. */
async function notify(user: Recipient, subject: string, bodyHtml: string): Promise<boolean> {
  if (user.emailOptOut) return false;
  const token = await ensureNotifyToken(user.id, user.notifyToken);
  return sendEmail({ to: user.email, subject, html: layout(bodyHtml, unsubscribeUrl(token)) });
}

// ── Trigger: a friend joined via your referral link ────────────────────────
export async function sendReferralWelcome(referrerId: string, newHandle: string): Promise<void> {
  const referrer = await prisma.user.findUnique({
    where: { id: referrerId },
    select: { id: true, email: true, handle: true, emailOptOut: true, notifyToken: true },
  });
  if (!referrer) return;
  const body = `<p>Good news, <strong>${referrer.handle}</strong> — <strong>${escapeHtml(newHandle)}</strong> just joined Code Arena with your invite link. 🎉</p>
  <p>That's one more toward your Recruiter badge and queue priority.</p>
  ${button(`${env.WEB_BASE_URL}/u/${encodeURIComponent(referrer.handle)}`, "View your profile")}`;
  await notify(referrer, `${newHandle} joined with your invite`, body);
}

// ── Sweep: contest-start reminders ─────────────────────────────────────────
export async function sweepContestReminders(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + REMINDER_LEAD_MS);
  const due = await prisma.registration.findMany({
    where: {
      remindedAt: null,
      remindAt: { not: null, lte: soon, gt: now }, // upcoming, within the lead window
    },
    include: {
      contest: { select: { id: true, name: true, startsAt: true } },
      user: { select: { id: true, email: true, handle: true, emailOptOut: true, notifyToken: true } },
    },
    take: 200,
  });

  for (const r of due) {
    // Mark first so a send that races another sweep can't double-fire.
    await prisma.registration.update({
      where: { contestId_userId: { contestId: r.contestId, userId: r.userId } },
      data: { remindedAt: new Date() },
    });
    const mins = Math.max(1, Math.round((r.contest.startsAt.getTime() - now.getTime()) / 60000));
    const body = `<p><strong>${escapeHtml(r.contest.name)}</strong> starts in about ${mins} minute${mins === 1 ? "" : "s"}.</p>
    <p>Warm up and get ready to compete.</p>
    ${button(`${env.WEB_BASE_URL}/contests/${r.contest.id}`, "Go to the contest")}`;
    await notify(r.user, `${r.contest.name} starts soon`, body);
  }
}

// ── Sweep: streak-about-to-lapse nudges ────────────────────────────────────
export async function sweepStreakNudges(): Promise<void> {
  const now = new Date();
  if (now.getUTCHours() < NUDGE_AFTER_UTC_HOUR) return; // wait until later in the UTC day
  const today = utcDate(now);
  const yesterday = new Date(today.getTime() - 86_400_000);

  // Candidates: solved yesterday (streak alive) but not today, not yet nudged today.
  const users = await prisma.user.findMany({
    where: {
      emailOptOut: false,
      currentStreak: { gt: 0 },
      lastDailyDate: yesterday,
      OR: [{ lastNudgeDate: null }, { lastNudgeDate: { lt: today } }],
    },
    select: { id: true, email: true, handle: true, emailOptOut: true, notifyToken: true, currentStreak: true, lastDailyDate: true },
    take: 200,
  });

  for (const u of users) {
    if (!streakAlive(u.lastDailyDate ? utcDate(u.lastDailyDate) : null, today)) continue;
    await prisma.user.update({ where: { id: u.id }, data: { lastNudgeDate: today } });
    const body = `<p>Your <strong>${u.currentStreak}-day streak</strong> 🔥 is about to expire.</p>
    <p>Solve today's daily challenge before midnight UTC to keep it alive.</p>
    ${button(`${env.WEB_BASE_URL}/daily`, "Solve today's challenge")}`;
    await notify(u, `Keep your ${u.currentStreak}-day streak alive`, body);
  }
}

/** Marks a user opted-out from their unsubscribe token. Returns their handle. */
export async function unsubscribeByToken(token: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { notifyToken: token }, select: { id: true, handle: true } });
  if (!user) return null;
  await prisma.user.update({ where: { id: user.id }, data: { emailOptOut: true } });
  return user.handle;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
