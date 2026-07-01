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
  | { type: "leaderboard"; contestId: string; frozen: boolean; rows: LeaderboardRow[] }
  | { type: "contest"; contestId: string; state: "upcoming" | "live" | "ended" }
  | { type: "queue_update"; count: number; capacity: number }
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

/** Battle Royale: 6 players race an ascending-difficulty problem ladder. */
export type MatchPlayerStatus = "ALIVE" | "ELIMINATED";

export interface MatchPlayerView {
  userId: string;
  handle: string;
  rating: number;
  status: MatchPlayerStatus;
  /** Whether this player has an accepted submission for the current round. */
  solvedCurrentRound: boolean;
  eliminatedRound: number | null;
  /** Final standing once the match is FINISHED (1 = winner). */
  placement: number | null;
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
  status: "ACTIVE" | "FINISHED";
  round: number;
  totalRounds: number;
  /** ISO timestamp the current round's timer expires at; null once finished. */
  roundEndsAt: string | null;
  problem: MatchProblemView | null;
  players: MatchPlayerView[];
}
