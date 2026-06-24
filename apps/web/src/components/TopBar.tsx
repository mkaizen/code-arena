import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../ctx/AuthContext.js";
import { tierOf } from "@arena/shared";

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const tier = user ? tierOf(user.rating) : null;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel)",
        flexShrink: 0,
        gap: 32,
      }}
    >
      {/* Brand */}
      <Link to="/contests" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ position: "relative", width: 10, height: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--v-ac)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
        </div>
        <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--txt)" }}>
          Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
        </span>
      </Link>

      {/* Nav links */}
      <nav style={{ display: "flex", gap: 4 }}>
        {[
          { to: "/contests", label: "Contests" },
          { to: "/problems", label: "Problems" },
          { to: "/leaderboard", label: "Leaderboard" },
          ...(user?.role === "ADMIN" || user?.role === "SETTER" ? [{ to: "/admin", label: "Admin" }] : []),
        ].map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            style={{
              color: "var(--txt-2)",
              fontSize: 14,
              fontWeight: 500,
              padding: "4px 12px",
              borderRadius: 6,
              transition: "color 0.15s, background 0.15s",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--txt)";
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--panel-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--txt-2)";
              (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User area */}
      {user ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            to="/profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                color: tier?.color ?? "var(--txt)",
                fontWeight: 700,
              }}
            >
              {user.handle}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--panel-2)",
                color: tier?.color ?? "var(--txt-2)",
                border: `1px solid var(--line)`,
                fontFamily: "var(--disp)",
              }}
            >
              {user.rating} · {tier?.name}
            </span>
          </Link>
          <button
            onClick={handleLogout}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 6,
              color: "var(--txt-2)",
              fontSize: 13,
              padding: "4px 12px",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--txt)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--txt-3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--txt-2)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)";
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        <Link
          to="/login"
          style={{
            background: "var(--v-ac)",
            color: "#06210C",
            fontWeight: 700,
            fontSize: 13,
            padding: "6px 16px",
            borderRadius: 6,
            textDecoration: "none",
            fontFamily: "var(--disp)",
          }}
        >
          Login
        </Link>
      )}
    </header>
  );
}
