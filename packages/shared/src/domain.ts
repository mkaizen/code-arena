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
  | { type: "contest"; contestId: string; state: "upcoming" | "live" | "ended" };

export interface LeaderboardRow {
  rank: number;
  userId: string;
  handle: string;
  rating: number;
  solved: number;
  penalty: number;
  perProblem: Record<string, { solved: boolean; tries: number; timeMin: number }>;
}
