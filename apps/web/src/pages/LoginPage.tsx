import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../ctx/AuthContext.js";

type Tab = "login" | "register";

export function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await register(handle, email, password);
      }
      navigate("/contests");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--txt)",
    fontSize: 14,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "var(--body)",
    transition: "border-color 0.15s",
  };

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
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: "var(--disp)",
              fontSize: 26,
              fontWeight: 700,
              color: "var(--txt)",
              marginBottom: 4,
            }}
          >
            Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
          </h1>
          <p style={{ color: "var(--txt-3)", fontSize: 13 }}>Compete. Judge. Rank.</p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            background: "var(--panel-2)",
            borderRadius: 8,
            padding: 3,
            marginBottom: 24,
          }}
        >
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex: 1,
                padding: "7px 0",
                background: tab === t ? "var(--panel)" : "transparent",
                border: tab === t ? "1px solid var(--line)" : "1px solid transparent",
                borderRadius: 6,
                color: tab === t ? "var(--txt)" : "var(--txt-2)",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--disp)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--txt-2)", marginBottom: 6, fontWeight: 500 }}>
                Handle
              </label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="your_handle"
                required
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--v-ac)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--txt-2)", marginBottom: 6, fontWeight: 500 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--v-ac)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--txt-2)", marginBottom: 6, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--v-ac)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(255,92,92,0.1)",
                border: "1px solid rgba(255,92,92,0.3)",
                borderRadius: 6,
                padding: "8px 12px",
                color: "var(--v-wa)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--v-ac)",
              color: "#06210C",
              fontWeight: 700,
              fontSize: 14,
              padding: "11px 0",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "var(--disp)",
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Loading…" : tab === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
