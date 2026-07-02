import type { Language, LeaderboardRow, MatchMode, MatchStateView } from "@arena/shared";

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
}

export interface Sample {
  ordinal: number;
  input: string;
  output: string;
}

export interface Problem extends ProblemSummary {
  statement: string;
  timeMs: number;
  memoryKb: number;
  samples: Sample[];
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

  register: (handle: string, email: string, password: string): Promise<StoredUser> =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ handle, email, password }) }),

  oauth: (provider: "github" | "google", code: string): Promise<StoredUser> =>
    req("/auth/oauth", { method: "POST", body: JSON.stringify({ provider, code }) }),

  problems: (params?: { difficulty?: string; tag?: string }): Promise<ProblemSummary[]> => {
    const qs = new URLSearchParams();
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    if (params?.tag) qs.set("tag", params.tag);
    const q = qs.toString();
    return req(`/problems${q ? `?${q}` : ""}`);
  },

  problem: (slug: string): Promise<Problem> => req(`/problems/${slug}`),

  submit: (body: { problemId: string; contestId?: string; matchId?: string; language: Language; source: string }): Promise<{ id: string; verdict: string }> =>
    req("/submissions", { method: "POST", body: JSON.stringify(body) }),

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
    slug: string; title: string; statement: string;
    difficulty: "easy" | "med" | "hard"; ratingValue: number; tags: string[];
    timeMs: number; memoryKb: number;
    samples: { input: string; output: string }[];
    tests: { input: string; output: string }[];
  }): Promise<{ id: string; slug: string }> =>
    req("/admin/problems", { method: "POST", body: JSON.stringify(body) }),

  adminCreateContest: (body: {
    name: string; startsAt: string; durationSec: number;
    scoring: "ICPC" | "POINTS"; rated: boolean; freezeSec: number;
    problems: { problemId: string; label: string; points: number }[];
  }): Promise<{ id: string }> =>
    req("/admin/contests", { method: "POST", body: JSON.stringify(body) }),

  adminFinalizeContest: (id: string): Promise<{ finalized: number; changes: { userId: string; before: number; after: number }[] }> =>
    req(`/admin/contests/${id}/finalize`, { method: "POST" }),

  // Real-time matches (Battle Royale + 1v1 Duel)
  queueForMatch: (mode: MatchMode): Promise<{ matched: boolean; matchId?: string; count: number; capacity: number }> =>
    req("/matches/queue", { method: "POST", body: JSON.stringify({ mode }) }),

  leaveMatchQueue: (): Promise<{ ok: boolean }> =>
    req("/matches/queue", { method: "DELETE" }),

  matchQueueStatus: (): Promise<{
    queuedMode: MatchMode | null;
    counts: Record<MatchMode, number>;
    capacities: Record<MatchMode, number>;
  }> => req("/matches/queue/status"),

  match: (id: string): Promise<MatchStateView> => req(`/matches/${id}`),
};
