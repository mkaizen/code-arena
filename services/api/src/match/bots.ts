/**
 * Practice-match bots that behave like real programming students: they think
 * before submitting, sometimes get it wrong a few times first, solve faster
 * when the problem is well within their level, and — crucially — sometimes just
 * don't solve a problem that's over their head. All timing/verdict decisions
 * live here as pure functions so the behaviour can be unit-tested without a
 * database, a judge, or wall-clock timers.
 */

/** A bot's temperament, which nudges reliability and pace. Derived, stably, from its identity. */
export type BotPersona = "steady" | "grinder" | "speedster" | "shaky";

const PERSONAS: BotPersona[] = ["steady", "grinder", "speedster", "shaky"];

/** Stable persona from a bot's id/handle — same bot always feels the same. */
export function personaFor(seed: string): BotPersona {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PERSONAS[h % PERSONAS.length];
}

/** The logistic "expected score" of a rating gap — the same curve the Elo system uses. */
function winProb(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** How reliable/fast each persona is, relative to a neutral "steady" student. */
const TRAIT: Record<BotPersona, { reliability: number; pace: number; maxWrong: number }> = {
  // reliability: additive tweak to solve probability.
  // pace: multiplier on solve time (<1 faster, >1 slower).
  // maxWrong: cap on wrong attempts they'll fire off.
  steady: { reliability: 0.0, pace: 1.0, maxWrong: 1 },
  grinder: { reliability: 0.08, pace: 1.15, maxWrong: 3 }, // persistent: solves more, but slower and messier
  speedster: { reliability: -0.04, pace: 0.68, maxWrong: 1 }, // quick, a touch careless
  shaky: { reliability: -0.11, pace: 1.05, maxWrong: 2 }, // struggles when out of depth
};

export interface BotRoundPlan {
  /** Whether the bot will land an accepted solution this round at all. */
  solves: boolean;
  /** Ms after round start when the accepted solution lands (only when `solves`). */
  solveAtMs: number | null;
  /** Ms after round start for each wrong attempt that precedes the solve (or is fired while failing). */
  wrongAtMs: number[];
}

/**
 * Decide how a bot plays one round. `rng` is a 0..1 source (injectable so tests
 * are deterministic). The result is a schedule of offsets from round start.
 */
export function botRoundPlan(
  botRating: number,
  problemRating: number,
  roundDurationSec: number,
  persona: BotPersona,
  rng: () => number = Math.random,
): BotRoundPlan {
  const trait = TRAIT[persona];
  const durMs = roundDurationSec * 1000;

  // Probability of solving at all: the rating curve, nudged by temperament and
  // clamped so even a mismatch is never a certainty in either direction.
  const p = clamp(winProb(botRating, problemRating) + trait.reliability, 0.03, 0.98);
  const solves = rng() < p;

  // How far into the round the bot lands its solve. A comfortable margin
  // (bot well above the problem) resolves early; an over-their-head problem
  // drags toward the buzzer. Personas scale the pace, and there's real spread.
  const margin = botRating - problemRating;
  const meanFrac = clamp(0.5 - margin / 1600, 0.12, 0.9) * trait.pace;

  if (solves) {
    const frac = clamp(meanFrac * (0.6 + 0.8 * rng()), 0.04, 0.95);
    const solveAtMs = Math.round(frac * durMs);
    // A few students bang their head first: 0..maxWrong wrong tries before the AC.
    const nWrong = Math.floor(rng() * (trait.maxWrong + 1));
    const wrongAtMs: number[] = [];
    for (let i = 0; i < nWrong; i++) wrongAtMs.push(Math.round(rng() * solveAtMs * 0.9));
    wrongAtMs.sort((a, b) => a - b);
    return { solves: true, solveAtMs, wrongAtMs };
  }

  // Didn't solve — but a real student still throws a couple of failed attempts
  // at it before the timer runs out rather than sitting on their hands.
  const nWrong = Math.floor(rng() * (trait.maxWrong + 1));
  const wrongAtMs: number[] = [];
  for (let i = 0; i < nWrong; i++) wrongAtMs.push(Math.round((0.2 + 0.75 * rng()) * durMs));
  wrongAtMs.sort((a, b) => a - b);
  return { solves: false, solveAtMs: null, wrongAtMs };
}

/**
 * Choose which bots fill a practice match: the ones closest in rating to the
 * human, so the field feels like a fair lobby rather than a random spread.
 */
export function pickOpponents<T extends { rating: number }>(
  humanRating: number,
  bots: T[],
  count: number,
): T[] {
  return [...bots]
    .sort((a, b) => Math.abs(a.rating - humanRating) - Math.abs(b.rating - humanRating))
    .slice(0, count);
}
