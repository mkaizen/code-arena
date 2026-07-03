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

/** Public, read-only view of any user (their profile page). */
export interface PublicProfile {
  handle: string;
  rating: number;
  joinedAt: string;
  solved: number;
  submissions: number;
  record: MatchRecord;
  recentMatches: MatchHistoryEntry[];
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
