const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

let token: string | null = null;
export function setToken(t: string) { token = t; }

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  problems: () => req("/problems"),
  problem: (slug: string) => req(`/problems/${slug}`),
  submit: (body: { problemId: string; contestId?: string; language: string; source: string }) =>
    req("/submissions", { method: "POST", body: JSON.stringify(body) }),
  leaderboard: (contestId: string) => req(`/contests/${contestId}/leaderboard`),
};
