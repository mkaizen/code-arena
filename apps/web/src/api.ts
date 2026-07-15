import type { DailyView, Language, LeaderboardRow, MatchHistoryEntry, MatchMode, MatchRecord, MatchReplay, MatchStateView, PlagiarismProblemReport, ProblemLeaderboard, ProblemVersionDetail, ProblemVersionSummary, PublicProfile, RunResult } from "@arena/shared";

export interface PlagiarismReport {
  contestId: string;
  name: string;
  reports: PlagiarismProblemReport[];
}

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

let token: string | null = localStorage.getItem("arena_token");
export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("arena_token", t);
  else localStorage.removeItem("arena_token");
}
export function getToken() { return token; }

export interface StoredUser {
  id: string;
  token: string;
  handle: string;
  rating: number;
  role?: "USER" | "SETTER" | "ADMIN";
}

export function storeUser(u: StoredUser) {
  localStorage.setItem("arena_user", JSON.stringify(u));
  setToken(u.token);
}

export function clearUser() {
  localStorage.removeItem("arena_user");
  localStorage.removeItem("arena_token");
  token = null;
}

export function getMe(): StoredUser | null {
  const raw = localStorage.getItem("arena_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

async function req<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export interface ProblemSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "med" | "hard";
  ratingValue: number;
  tags: string[];
  /** Distinct users who have an accepted submission. */
  solved: number;
  /** Accepted submissions as a % of all submissions; null if never attempted. */
  acceptance: number | null;
}

export interface Sample {
  ordinal: number;
  input: string;
  output: string;
}

export interface Problem extends ProblemSummary {
  statement: string;
  editorial: string | null;
  timeMs: number;
  memoryKb: number;
  samples: Sample[];
}

export interface AdminProblemRow {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "med" | "hard";
  ratingValue: number;
  testCount: number;
}

export interface AdminProblemDetail {
  id: string;
  slug: string;
  title: string;
  statement: string;
  editorial: string | null;
  difficulty: "easy" | "med" | "hard";
  ratingValue: number;
  tags: string[];
  timeMs: number;
  memoryKb: number;
  testCount: number;
  samples: { input: string; output: string }[];
}

export interface ContestProblemEntry {
  label: string;
  points: number;
  problem: ProblemSummary;
}

export interface Contest {
  id: string;
  name: string;
  startsAt: string;
  durationSec: number;
  scoring: "ICPC" | "POINTS";
  rated: boolean;
  registered?: boolean;
  problems?: ContestProblemEntry[];
}

export interface Submission {
  id: string;
  problemId: string;
  contestId?: string;
  language: Language;
  verdict: string;
  createdAt: string;
}

export interface GlobalLBRow {
  handle: string;
  rating: number;
}

export interface LeaderboardData {
  frozen: boolean;
  rows: LeaderboardRow[];
}

export const api = {
  login: (email: string, password: string): Promise<StoredUser> =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  register: (handle: string, email: string, password: string, ref?: string): Promise<StoredUser> =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ handle, email, password, ref }) }),

  oauth: (provider: "github" | "google", code: string): Promise<StoredUser> =>
    req("/auth/oauth", { method: "POST", body: JSON.stringify({ provider, code }) }),

  refresh: (): Promise<StoredUser> =>
    req("/auth/refresh", { method: "POST", body: "{}" }),

  problems: (params?: { difficulty?: string; tag?: string }): Promise<ProblemSummary[]> => {
    const qs = new URLSearchParams();
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    if (params?.tag) qs.set("tag", params.tag);
    const q = qs.toString();
    return req(`/problems${q ? `?${q}` : ""}`);
  },

  problem: (slug: string): Promise<Problem> => req(`/problems/${slug}`),

  problemLeaderboard: (slug: string): Promise<ProblemLeaderboard> => req(`/problems/${slug}/leaderboard`),

  submit: (body: { problemId: string; contestId?: string; matchId?: string; language: Language; source: string }): Promise<{ id: string; verdict: string }> =>
    req("/submissions", { method: "POST", body: JSON.stringify(body) }),

  run: (body: { problemId: string; language: Language; source: string; customInput?: string }): Promise<{ runId: string }> =>
    req("/run", { method: "POST", body: JSON.stringify(body) }),

  // Poll a run's result — used by logged-out clients that have no WebSocket.
  runResult: (runId: string): Promise<{ result: RunResult | null }> => req(`/run/${runId}`),

  submissions: (): Promise<Submission[]> => req("/submissions"),

  contests: (): Promise<Contest[]> => req("/contests"),

  contest: (id: string): Promise<Contest> => req(`/contests/${id}`),

  registerContest: (id: string): Promise<{ ok: boolean }> =>
    req(`/contests/${id}/register`, { method: "POST", body: "{}" }),

  leaderboard: (contestId: string): Promise<LeaderboardData> =>
    req(`/contests/${contestId}/leaderboard`),

  globalLeaderboard: (): Promise<GlobalLBRow[]> => req("/leaderboard/global"),

  // Admin routes
  adminCreateProblem: (body: {
    slug: string; title: string; statement: string; editorial?: string;
    difficulty: "easy" | "med" | "hard"; ratingValue: number; tags: string[];
    timeMs: number; memoryKb: number;
    samples: { input: string; output: string }[];
    tests: { input: string; output: string }[];
  }): Promise<{ id: string; slug: string }> =>
    req("/admin/problems", { method: "POST", body: JSON.stringify(body) }),

  adminProblems: (): Promise<AdminProblemRow[]> => req("/admin/problems"),

  adminGetProblem: (id: string): Promise<AdminProblemDetail> => req(`/admin/problems/${id}`),

  adminUpdateProblem: (id: string, body: {
    slug: string; title: string; statement: string; editorial?: string;
    difficulty: "easy" | "med" | "hard"; ratingValue: number; tags: string[];
    timeMs: number; memoryKb: number;
    samples: { input: string; output: string }[];
  }): Promise<{ ok: boolean; slug: string }> =>
    req(`/admin/problems/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  adminReplaceTests: (id: string, tests: { input: string; output: string }[]): Promise<{ ok: boolean }> =>
    req(`/admin/problems/${id}/tests`, { method: "PUT", body: JSON.stringify({ tests }) }),

  adminProblemVersions: (id: string): Promise<ProblemVersionSummary[]> =>
    req(`/admin/problems/${id}/versions`),

  adminProblemVersion: (id: string, version: number): Promise<ProblemVersionDetail> =>
    req(`/admin/problems/${id}/versions/${version}`),

  adminRestoreProblemVersion: (id: string, version: number): Promise<{ ok: boolean; restoredFrom: number }> =>
    req(`/admin/problems/${id}/versions/${version}/restore`, { method: "POST" }),

  adminCreateContest: (body: {
    name: string; startsAt: string; durationSec: number;
    scoring: "ICPC" | "POINTS"; rated: boolean; freezeSec: number;
    problems: { problemId: string; label: string; points: number }[];
  }): Promise<{ id: string }> =>
    req("/admin/contests", { method: "POST", body: JSON.stringify(body) }),

  adminFinalizeContest: (id: string): Promise<{ finalized: number; changes: { userId: string; before: number; after: number }[] }> =>
    req(`/admin/contests/${id}/finalize`, { method: "POST" }),

  adminContestPlagiarism: (id: string, threshold?: number): Promise<PlagiarismReport> =>
    req(`/admin/contests/${id}/plagiarism${threshold !== undefined ? `?threshold=${threshold}` : ""}`),

  // Real-time matches (Battle Royale + 1v1 Duel)
  queueForMatch: (mode: MatchMode): Promise<{ matched: boolean; matchId?: string; count: number; capacity: number }> =>
    req("/matches/queue", { method: "POST", body: JSON.stringify({ mode }) }),

  leaveMatchQueue: (): Promise<{ ok: boolean }> =>
    req("/matches/queue", { method: "DELETE" }),

  startPracticeMatch: (mode: MatchMode): Promise<{ matchId: string }> =>
    req("/matches/practice", { method: "POST", body: JSON.stringify({ mode }) }),

  matchQueueStatus: (): Promise<{
    queuedMode: MatchMode | null;
    counts: Record<MatchMode, number>;
    capacities: Record<MatchMode, number>;
  }> => req("/matches/queue/status"),

  match: (id: string): Promise<MatchStateView> => req(`/matches/${id}`),

  publicMatch: (id: string): Promise<MatchStateView> => req(`/matches/${id}/public`),

  matchReplay: (id: string): Promise<MatchReplay> => req(`/matches/${id}/replay`),

  matchHeartbeat: (id: string): Promise<{ ok: boolean }> =>
    req(`/matches/${id}/heartbeat`, { method: "POST", body: "{}" }),

  matchReact: (id: string, emoji: string): Promise<{ sent: boolean }> =>
    req(`/matches/${id}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),

  matchHistory: (): Promise<{ record: MatchRecord; matches: MatchHistoryEntry[] }> =>
    req("/matches/history"),

  userProfile: (handle: string): Promise<PublicProfile> =>
    req(`/users/${encodeURIComponent(handle)}`),

  daily: (): Promise<DailyView> => req("/daily"),
};
