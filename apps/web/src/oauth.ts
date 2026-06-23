// Client-side OAuth kickoff. Client IDs are public and baked at build time
// (VITE_*). The authorization-code exchange itself happens server-side in
// services/api/src/auth/oauth.ts — the browser only carries the `code` back.

export type OAuthProvider = "github" | "google";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function oauthEnabled(provider: OAuthProvider): boolean {
  return provider === "github" ? !!GITHUB_CLIENT_ID : !!GOOGLE_CLIENT_ID;
}

export function anyOAuthEnabled(): boolean {
  return oauthEnabled("github") || oauthEnabled("google");
}

/** Redirect URI must match the API's OAUTH_REDIRECT_BASE/<provider>. */
function redirectUri(provider: OAuthProvider): string {
  return `${window.location.origin}/auth/callback/${provider}`;
}

const STATE_KEY = "arena_oauth_state";

function newState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(STATE_KEY, state);
  return state;
}

/** Verify and consume the state returned on the callback (CSRF guard). */
export function consumeState(returned: string | null): boolean {
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return !!expected && !!returned && expected === returned;
}

/** Send the browser to the provider's consent screen. */
export function startOAuth(provider: OAuthProvider): void {
  const state = newState();
  const redirect = redirectUri(provider);

  let url: string;
  if (provider === "github") {
    const qs = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID ?? "",
      redirect_uri: redirect,
      scope: "read:user user:email",
      state,
    });
    url = `https://github.com/login/oauth/authorize?${qs}`;
  } else {
    const qs = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    url = `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
  }
  window.location.assign(url);
}
