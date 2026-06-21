import { env } from "../env.js";

export interface OAuthIdentity {
  provider: "github" | "google";
  providerId: string;
  email: string;
  suggestedHandle: string;
}

/**
 * Implemented (was TODO): OAuth authorization-code exchange for GitHub & Google.
 * Exchanges the short-lived code for a token, then fetches the canonical identity.
 */
export async function exchangeOAuthCode(
  provider: "github" | "google",
  code: string,
): Promise<OAuthIdentity> {
  if (provider === "github") return exchangeGithub(code);
  return exchangeGoogle(code);
}

async function exchangeGithub(code: string): Promise<OAuthIdentity> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.OAUTH_REDIRECT_BASE}/github`,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`github token exchange failed: ${token.error ?? "unknown"}`);

  const headers = { Authorization: `Bearer ${token.access_token}`, "User-Agent": "code-arena" };
  const [profile, emails] = await Promise.all([
    fetch("https://api.github.com/user", { headers }).then((r) => r.json()) as Promise<{ id: number; login: string }>,
    fetch("https://api.github.com/user/emails", { headers }).then((r) => r.json()) as Promise<
      { email: string; primary: boolean; verified: boolean }[]
    >,
  ]);
  const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];
  return {
    provider: "github",
    providerId: String(profile.id),
    email: primary?.email ?? `${profile.login}@users.noreply.github.com`,
    suggestedHandle: profile.login,
  };
}

async function exchangeGoogle(code: string): Promise<OAuthIdentity> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: `${env.OAUTH_REDIRECT_BASE}/google`,
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`google token exchange failed: ${token.error ?? "unknown"}`);

  const profile = (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json())) as { sub: string; email: string };

  return {
    provider: "google",
    providerId: profile.sub,
    email: profile.email,
    suggestedHandle: profile.email.split("@")[0],
  };
}
