export type Language = "cpp" | "py" | "java" | "js" | "go" | "rs";

export const LANGUAGES: Language[] = ["cpp", "py", "java", "js", "go", "rs"];

export type Difficulty = "easy" | "med" | "hard";

export type ScoringModel = "ICPC" | "POINTS";

export interface ProblemLimits {
  timeMs: number;
  memoryKb: number;
}

export interface SubmissionPayload {
  problemId: string;
  contestId?: string;
  language: Language;
  source: string;
}

/** What the WebSocket pushes to clients (FR-19). */
export type ServerEvent =
  | { type: "verdict"; submissionId: string; result: import("./verdicts.js").JudgeResult }
  | { type: "run_result"; runId: string; result: import("./verdicts.js").RunResult }
  | { type: "leaderboard"; contestId: string; frozen: boolean; rows: LeaderboardRow[] }
  | { type: "contest"; contestId: string; state: "upcoming" | "live" | "ended" }
  | { type: "queue_update"; mode: MatchMode; count: number; capacity: number; fillDeadline?: string | null }
  | { type: "match_found"; matchId: string; playerIds: string[] }
  | { type: "match_state"; match: MatchStateView }
  | { type: "match_activity"; matchId: string; event: MatchActivity }
  | { type: "match_reaction"; matchId: string; reaction: MatchReaction }
  | { type: "rematch"; matchId: string; offeredBy: string[]; declined: boolean };

/** One line of the live match feed: who just submitted, and how it went. */
export interface MatchActivity {
  handle: string;
  isBot: boolean;
  /** The submission's verdict (ACCEPTED, WRONG_ANSWER, TIME_LIMIT_EXCEEDED, …). */
  verdict: string;
  /** 0-based round the submission was made in. */
  round: number;
  /** ISO timestamp the verdict landed. */
  at: string;
}

/**
 * The emotes players can fire at each other mid-match — the whole social
 * palette, small on purpose. A reaction is presence, not chat: it says "nice"
 * or "ouch" without a keyboard leaving the code, and there's no free text to
 * moderate. The order here is the order they render in the reaction bar.
 */
export const MATCH_REACTIONS = ["👍", "🔥", "😮", "😅", "🧠", "🎉"] as const;
export type MatchReactionEmoji = (typeof MATCH_REACTIONS)[number];

/**
 * Reject anything that isn't one of the sanctioned emotes. Both the API (before
 * it fans a reaction out) and the client (before it sends one) go through this,
 * so an arbitrary string can never ride the reaction channel.
 */
export function sanitizeReaction(emoji: unknown): MatchReactionEmoji | null {
  return typeof emoji === "string" && (MATCH_REACTIONS as readonly string[]).includes(emoji)
    ? (emoji as MatchReactionEmoji)
    : null;
}

/** One emote fired by a player during a live match (ephemeral — never stored). */
export interface MatchReaction {
  handle: string;
  isBot: boolean;
  emoji: MatchReactionEmoji;
  /** ISO timestamp the reaction was sent. */
  at: string;
}

/**
 * Plagiarism/duplicate-detection signals (NFR-4). A `PlagiarismPair` is two
 * submissions by different users whose structural fingerprints overlap enough
 * to warrant a human look — it is a signal, never a verdict.
 */
export interface PlagiarismParty {
  userId: string;
  handle: string;
  submissionId: string;
}

export interface PlagiarismPair {
  a: PlagiarismParty;
  b: PlagiarismParty;
  /** Overlap of the smaller fingerprint set, 0..1 (1 = one fully contains the other). */
  similarity: number;
  /** Number of shared fingerprints backing the score. */
  sharedFingerprints: number;
}

export interface PlagiarismProblemReport {
  problemId: string;
  slug: string;
  title: string;
  /** Distinct users whose submissions were compared for this problem. */
  submissionsCompared: number;
  pairs: PlagiarismPair[];
}

/** Problem-bank version history (FR-7). */
export interface ProblemVersionSummary {
  version: number;
  title: string;
  editorHandle: string | null;
  createdAt: string;
}

export interface ProblemVersionDetail extends ProblemVersionSummary {
  statement: string;
  editorial: string | null;
  difficulty: string;
  ratingValue: number;
  tags: string[];
  timeMs: number;
  memoryKb: number;
  testCount: number;
  samples: { input: string; output: string }[];
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  handle: string;
  rating: number;
  solved: number;
  penalty: number;
  perProblem: Record<string, { solved: boolean; tries: number; timeMin: number }>;
}

/**
 * Real-time matches. ROYALE (6) and QUADS (4) are elimination ladders — race an
 * ascending-difficulty ladder, miss a round's timer and you're eliminated, last
 * one standing wins. DUEL: 1v1 best-of-3 — first accepted submission takes the
 * round, most round wins takes the match.
 */
export type MatchMode = "ROYALE" | "QUADS" | "DUEL";

/** Human-readable mode names for UI. */
export const MODE_LABELS: Record<MatchMode, string> = {
  ROYALE: "Battle Royale",
  QUADS: "Quad Royale",
  DUEL: "1v1 Duel",
};

/**
 * Display name for a problem tag. Tags are stored as URL-safe slugs
 * (e.g. "two-pointers"); most read fine title-cased, a few need a hand.
 * (Mirrored in apps/web/prerender.mjs for the static topic-hub pages.)
 */
const TAG_LABEL_OVERRIDES: Record<string, string> = {
  dp: "Dynamic Programming",
};
export function tagLabel(tag: string): string {
  return (
    TAG_LABEL_OVERRIDES[tag] ??
    tag.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ")
  );
}

/** Minimal problem shape needed to rank relatedness. */
export interface RelatedProblemInput {
  slug: string;
  title: string;
  ratingValue: number;
  tags: string[];
}

/**
 * Rank the problems most related to `target` by shared-tag overlap (more shared
 * tags = more related), breaking ties by closeness in rating and then title for
 * determinism. Only problems that share at least one tag are returned, and the
 * target itself is excluded. Generic so callers keep their own richer row type.
 */
export function relatedProblems<T extends RelatedProblemInput>(target: RelatedProblemInput, all: T[], limit = 6): T[] {
  const tags = new Set(target.tags);
  return all
    .filter((p) => p.slug !== target.slug)
    .map((p) => ({ p, shared: p.tags.reduce((n, t) => n + (tags.has(t) ? 1 : 0), 0) }))
    .filter((x) => x.shared > 0)
    .sort((a, b) =>
      b.shared - a.shared ||
      Math.abs(a.p.ratingValue - target.ratingValue) - Math.abs(b.p.ratingValue - target.ratingValue) ||
      a.p.title.localeCompare(b.p.title),
    )
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * Pull a "Time … / Space …" complexity line out of an editorial (HTML or plain
 * text), if present — the kind of glanceable fact worth surfacing on the page.
 */
export function extractComplexity(editorial: string): { time: string | null; space: string | null } | null {
  const text = editorial.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ");
  const time = text.match(/Time:\s*(O\([^)]*\)[^.<]*)/i);
  const space = text.match(/Space:\s*(O\([^)]*\)[^.<]*)/i);
  if (!time && !space) return null;
  return { time: time ? time[1].trim() : null, space: space ? space[1].trim() : null };
}
export type MatchPlayerStatus = "ALIVE" | "ELIMINATED";

export interface MatchPlayerView {
  userId: string;
  handle: string;
  rating: number;
  /** A seeded practice bot rather than a real person. */
  isBot: boolean;
  status: MatchPlayerStatus;
  /** Whether this player has an accepted submission for the current round. */
  solvedCurrentRound: boolean;
  eliminatedRound: number | null;
  /** DUEL: rounds this player has won so far. */
  roundWins: number;
  /** Left the match (disconnected past the grace window). */
  forfeited: boolean;
  /** Final standing once the match is FINISHED (1 = winner). */
  placement: number | null;
  /** Rating change applied at finish (matches are rated); null while active. */
  ratingBefore: number | null;
  ratingAfter: number | null;
}

/** One finished match in a user's history (profile page). */
export interface MatchHistoryEntry {
  matchId: string;
  mode: MatchMode;
  placement: number | null;
  playerCount: number;
  won: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  endedAt: string | null;
}

export interface MatchRecord {
  wins: number;
  losses: number;
  played: number;
}

/** Successful referrals needed to unlock the Recruiter badge + queue priority. */
export const RECRUITER_THRESHOLD = 3;

/** Public, read-only view of any user (their profile page). */
export interface PublicProfile {
  handle: string;
  rating: number;
  joinedAt: string;
  solved: number;
  submissions: number;
  record: MatchRecord;
  recentMatches: MatchHistoryEntry[];
  /** Successful invites (referral growth loop). */
  referrals: number;
  /** Unlocked once referrals >= RECRUITER_THRESHOLD (3). */
  recruiter: boolean;
  /** Current daily-challenge streak (0 if lapsed). */
  currentStreak: number;
  /** Best daily-challenge streak ever reached. */
  longestStreak: number;
}

/** A user's daily-challenge streak state. */
export interface StreakInfo {
  current: number;
  longest: number;
  solvedToday: boolean;
}

/** One cell of the daily-challenge solve calendar. */
export interface CalendarDay {
  /** YYYY-MM-DD (UTC). */
  date: string;
  solved: boolean;
}

/** The daily-challenge view: today's problem plus (if logged in) streak state. */
export interface DailyView {
  /** YYYY-MM-DD (UTC). */
  date: string;
  problem: {
    id: string;
    slug: string;
    title: string;
    difficulty: Difficulty;
    ratingValue: number;
    tags: string[];
  } | null;
  streak: StreakInfo | null;
  calendar: CalendarDay[] | null;
}

// ── Per-problem speed & brevity leaderboards ────────────────────────────────
export interface SpeedRow {
  handle: string;
  /** Fastest accepted runtime (ms). */
  timeMs: number;
  language: Language;
}

export interface BrevityRow {
  handle: string;
  /** Shortest accepted source length (characters). */
  chars: number;
  language: Language;
}

export interface ProblemLeaderboard {
  fastest: SpeedRow[];
  shortest: BrevityRow[];
}

// ── Match replay / post-match "game review" ────────────────────────────────
export interface ReplayPlayer {
  userId: string;
  handle: string;
  rating: number;
  placement: number | null;
  roundWins: number;
  eliminatedRound: number | null;
  forfeited: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface ReplayRoundEntry {
  userId: string;
  handle: string;
  /** Total submissions this player made on this round's problem. */
  attempts: number;
  solved: boolean;
  /** Ms from match start to this player's first accepted submission. */
  solvedAtMs: number | null;
  /** The first player to solve this round. */
  firstSolver: boolean;
}

export interface ReplayRound {
  round: number;
  problem: { slug: string; title: string; difficulty: Difficulty; ratingValue: number } | null;
  entries: ReplayRoundEntry[];
}

/** One submission on the chronological match feed. */
export interface ReplayEvent {
  /** Ms from match start. */
  atMs: number;
  userId: string;
  handle: string;
  round: number;
  verdict: string;
  accepted: boolean;
}

export interface MatchReplay {
  id: string;
  mode: MatchMode;
  totalRounds: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  players: ReplayPlayer[];
  rounds: ReplayRound[];
  timeline: ReplayEvent[];
}

export interface MatchProblemView {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  ratingValue: number;
}

/** One in-progress match on the public "Live now" list (spectator discovery). */
export interface LiveMatchSummary {
  id: string;
  mode: MatchMode;
  round: number;
  totalRounds: number;
  /** Handles of the players still alive, for a glanceable "who's playing". */
  players: { handle: string; isBot: boolean }[];
  /** How many players remain (ROYALE thins out as it goes). */
  aliveCount: number;
}

export interface MatchStateView {
  id: string;
  mode: MatchMode;
  status: "ACTIVE" | "FINISHED";
  round: number;
  totalRounds: number;
  /** ISO timestamp the current round's timer expires at; null once finished. */
  roundEndsAt: string | null;
  problem: MatchProblemView | null;
  players: MatchPlayerView[];
  /** A practice match against bots — unrated, and no waiting for a lobby. */
  practice: boolean;
  /** A "Challenge the AI" duel: the opponent is an LLM writing real, judged code. */
  aiDuel: boolean;
}
