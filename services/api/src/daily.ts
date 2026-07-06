import { prisma } from "./db.js";
import { utcDate, addDays, sameDay, nextStreak, streakAlive } from "./streak.js";

export { utcDate };

/** Days a problem stays off the daily rotation once it has been featured. */
const COOLDOWN_DAYS = 30;
/** How many past days the streak calendar shows. */
export const CALENDAR_DAYS = 14;

/** Small deterministic hash of a date so the daily pick is stable per day. */
function seedFor(date: Date): number {
  const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface DailyProblem {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  ratingValue: number;
  tags: string[];
}

/**
 * Returns the featured problem for `date`, creating the row on first access.
 * Selection is deterministic (seeded by the date) and skips any problem used
 * in the previous COOLDOWN_DAYS so the same puzzle doesn't recur too soon.
 * The upsert makes concurrent first-hits race-safe — whoever writes first wins
 * and everyone reads the same row.
 */
export async function getDailyProblem(date: Date): Promise<DailyProblem | null> {
  const existing = await prisma.dailyChallenge.findUnique({
    where: { date },
    include: { problem: { select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, tags: true } } },
  });
  if (existing) return existing.problem;

  const recent = await prisma.dailyChallenge.findMany({
    where: { date: { gte: addDays(date, -COOLDOWN_DAYS), lt: date } },
    select: { problemId: true },
  });
  const recentIds = new Set(recent.map((r) => r.problemId));

  const all = await prisma.problem.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, tags: true },
  });
  if (all.length === 0) return null;

  const pool = all.filter((p) => !recentIds.has(p.id));
  const candidates = pool.length > 0 ? pool : all; // fall back if bank smaller than cooldown
  const picked = candidates[seedFor(date) % candidates.length];

  const row = await prisma.dailyChallenge.upsert({
    where: { date },
    create: { date, problemId: picked.id },
    update: {},
    include: { problem: { select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true, tags: true } } },
  });
  return row.problem;
}

export interface StreakInfo {
  current: number;
  longest: number;
  solvedToday: boolean;
}

export async function streakFor(userId: string): Promise<StreakInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, lastDailyDate: true },
  });
  if (!user) return { current: 0, longest: 0, solvedToday: false };

  const today = utcDate();
  const last = user.lastDailyDate ? utcDate(user.lastDailyDate) : null;
  const solvedToday = !!last && sameDay(last, today);
  // A lapsed streak reads as 0 even though the stored counter is stale.
  const alive = streakAlive(last, today);
  return {
    current: alive ? user.currentStreak : 0,
    longest: user.longestStreak,
    solvedToday,
  };
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  solved: boolean;
}

export async function calendarFor(userId: string): Promise<CalendarDay[]> {
  const today = utcDate();
  const from = addDays(today, -(CALENDAR_DAYS - 1));
  const solves = await prisma.dailySolve.findMany({
    where: { userId, date: { gte: from, lte: today } },
    select: { date: true },
  });
  const solvedSet = new Set(solves.map((s) => utcDate(s.date).toISOString().slice(0, 10)));
  const days: CalendarDay[] = [];
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const d = addDays(from, i).toISOString().slice(0, 10);
    days.push({ date: d, solved: solvedSet.has(d) });
  }
  return days;
}

/**
 * Records a user's solve of the daily challenge and advances their streak.
 * Called from the verdict subscriber when a practice submission is accepted;
 * `submittedAt` anchors the solve to the day the code was submitted (not the
 * day the verdict happens to land). No-ops unless the solved problem is that
 * day's featured problem, and is idempotent per (user, day).
 */
export async function recordDailySolve(userId: string, problemId: string, submittedAt: Date): Promise<void> {
  const date = utcDate(submittedAt);
  const daily = await prisma.dailyChallenge.findUnique({ where: { date }, select: { problemId: true } });
  if (!daily || daily.problemId !== problemId) return;

  const already = await prisma.dailySolve.findUnique({ where: { userId_date: { userId, date } }, select: { userId: true } });
  if (already) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, lastDailyDate: true },
  });
  if (!user) return;

  const last = user.lastDailyDate ? utcDate(user.lastDailyDate) : null;
  const { current, longest } = nextStreak(last, user.currentStreak, user.longestStreak, date);

  await prisma.$transaction([
    prisma.dailySolve.create({ data: { userId, date, problemId } }),
    prisma.user.update({
      where: { id: userId },
      data: { currentStreak: current, longestStreak: longest, lastDailyDate: date },
    }),
  ]);
}
