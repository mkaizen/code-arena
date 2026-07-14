import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../ctx/AuthContext.js";
import { tierOf } from "@arena/shared";
import { useMediaQuery } from "../hooks/useMediaQuery.js";

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const tier = user ? tierOf(user.rating) : null;
  const isMobile = useMediaQuery("(max-width: 820px)");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login");
  }

  const navItems = [
    { to: "/daily", label: "Daily" },
    { to: "/contests", label: "Contests" },
    { to: "/problems", label: "Problems" },
    { to: "/battle", label: "Battle Royale" },
    { to: "/leaderboard", label: "Leaderboard" },
    { to: "/blog", label: "Blog" },
    ...(user?.role === "ADMIN" || user?.role === "SETTER" ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  const userChip = user && (
    <Link to="/profile" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: tier?.color ?? "var(--txt)", fontWeight: 700 }}>
        {user.handle}
      </span>
      <span
        style={{
          fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
          background: "var(--panel-2)", color: tier?.color ?? "var(--txt-2)",
          border: "1px solid var(--line)", fontFamily: "var(--disp)",
        }}
      >
        {user.rating} · {tier?.name}
      </span>
    </Link>
  );

  const logoutBtn = (
    <button
      onClick={handleLogout}
      style={{
        background: "transparent", border: "1px solid var(--line)", borderRadius: 6,
        color: "var(--txt-2)", fontSize: 13, padding: "4px 12px", cursor: "pointer",
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
  );

  const loginBtn = (
    <Link
      to="/login"
      onClick={() => setMenuOpen(false)}
      style={{
        background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 13,
        padding: "6px 16px", borderRadius: 6, textDecoration: "none", fontFamily: "var(--disp)",
        textAlign: "center",
      }}
    >
      Login
    </Link>
  );

  return (
    <header
      style={{
        position: "relative",
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel)",
        flexShrink: 0,
        gap: isMobile ? 12 : 32,
      }}
    >
      {/* Brand */}
      <Link to="/contests" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ position: "relative", width: 10, height: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--v-ac)", animation: "pulse 2s ease-in-out infinite" }} />
        </div>
        <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--txt)" }}>
          Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
        </span>
      </Link>

      {!isMobile && (
        <>
          {/* Desktop nav links */}
          <nav style={{ display: "flex", gap: 4 }}>
            {navItems.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                style={{
                  color: "var(--txt-2)", fontSize: 14, fontWeight: 500, padding: "4px 12px",
                  borderRadius: 6, transition: "color 0.15s, background 0.15s", textDecoration: "none",
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

          <div style={{ flex: 1 }} />

          {/* Desktop user area */}
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {userChip}
              {logoutBtn}
            </div>
          ) : (
            loginBtn
          )}
        </>
      )}

      {isMobile && (
        <>
          <div style={{ flex: 1 }} />
          {/* Hamburger toggle */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            style={{
              background: "transparent", border: "1px solid var(--line)", borderRadius: 6,
              color: "var(--txt)", fontSize: 18, lineHeight: 1, width: 38, height: 34,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                background: "var(--panel)", borderBottom: "1px solid var(--line)",
                display: "flex", flexDirection: "column", padding: "8px 12px", gap: 2,
                boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
              }}
            >
              {navItems.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    color: "var(--txt)", fontSize: 15, fontWeight: 600, padding: "11px 12px",
                    borderRadius: 8, textDecoration: "none", fontFamily: "var(--disp)",
                  }}
                >
                  {label}
                </Link>
              ))}
              <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
              {user ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 12px 8px" }}>
                  {userChip}
                  {logoutBtn}
                </div>
              ) : (
                <div style={{ padding: "4px 4px 8px" }}>{loginBtn}</div>
              )}
            </div>
          )}
        </>
      )}
    </header>
  );
}
