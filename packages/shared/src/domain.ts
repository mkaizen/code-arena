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
  | { type: "queue_update"; mode: MatchMode; count: number; capacity: number }
  | { type: "match_found"; matchId: string; playerIds: string[] }
  | { type: "match_state"; match: MatchStateView };

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
 * Real-time matches. ROYALE: 6 players race an ascending-difficulty ladder,
 * miss a round's timer and you're eliminated. DUEL: 1v1 best-of-3 — first
 * accepted submission takes the round, most round wins takes the match.
 */
export type MatchMode = "ROYALE" | "DUEL";
export type MatchPlayerStatus = "ALIVE" | "ELIMINATED";

export interface MatchPlayerView {
  userId: string;
  handle: string;
  rating: number;
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
}
