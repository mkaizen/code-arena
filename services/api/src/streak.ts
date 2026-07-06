/**
 * Pure daily-challenge streak arithmetic — no I/O, no Prisma — so it can be
 * unit-tested in isolation and reused by both the daily module and its routes.
 */

/** Midnight-UTC Date for the calendar day containing `at` (default: now). */
export function utcDate(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/**
 * Given the previously stored counters and the day being solved, returns the
 * new counters. A solve on the day immediately after `last` extends the
 * streak; any longer gap restarts it at 1.
 */
export function nextStreak(
  last: Date | null,
  storedCurrent: number,
  storedLongest: number,
  solveDate: Date,
): { current: number; longest: number } {
  const continues = !!last && sameDay(last, addDays(solveDate, -1));
  const current = continues ? storedCurrent + 1 : 1;
  return { current, longest: Math.max(storedLongest, current) };
}

/**
 * A streak survives only while the last solve was today or yesterday; an older
 * last-solve means it has lapsed.
 */
export function streakAlive(last: Date | null, today: Date): boolean {
  if (!last) return false;
  return sameDay(last, today) || sameDay(last, addDays(today, -1));
}
