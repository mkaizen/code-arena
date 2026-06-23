import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../ctx/AuthContext.js";
import { consumeState, type OAuthProvider } from "../oauth.js";

export function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const { loginWithOAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against React 18 StrictMode double-invoke
    ran.current = true;

    const code = params.get("code");
    const returnedState = params.get("state");
    const providerErr = params.get("error_description") ?? params.get("error");

    if (providerErr) { setError(providerErr); return; }
    if (provider !== "github" && provider !== "google") { setError("Unknown provider."); return; }
    if (!code) { setError("Missing authorization code."); return; }
    if (!consumeState(returnedState)) { setError("State mismatch — please try signing in again."); return; }

    loginWithOAuth(provider as OAuthProvider, code)
      .then(() => navigate("/contests", { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [provider, params, loginWithOAuth, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ink)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
        }}
      >
        {error ? (
          <>
            <div
              style={{
                background: "rgba(255,92,92,0.1)",
                border: "1px solid rgba(255,92,92,0.3)",
                borderRadius: 6,
                padding: "10px 14px",
                color: "var(--v-wa)",
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              {error}
            </div>
            <button
              onClick={() => navigate("/login", { replace: true })}
              style={{
                background: "var(--v-ac)",
                color: "#06210C",
                fontWeight: 700,
                fontSize: 14,
                padding: "10px 20px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--disp)",
              }}
            >
              Back to Login
            </button>
          </>
        ) : (
          <p style={{ color: "var(--txt-2)", fontSize: 14 }}>Signing you in…</p>
        )}
      </div>
    </div>
  );
}
