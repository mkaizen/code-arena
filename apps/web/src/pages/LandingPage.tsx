import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../ctx/AuthContext.js";
import { useSeo } from "../hooks/useSeo.js";

function TermLine({ delay, dim, children }: { delay: number; dim?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0, animation: `reveal 0.4s ease forwards`, animationDelay: `${delay}s`, color: dim ? "var(--txt-3)" : "var(--txt)" }}>
      {children}
    </div>
  );
}

function TermCase({ delay, statusDelay, n, ms }: { delay: number; statusDelay: number; n: string; ms: number }) {
  return (
    <div style={{ display: "flex", gap: 10, opacity: 0, animation: "reveal 0.4s ease forwards", animationDelay: `${delay}s` }}>
      <span style={{ color: "var(--txt-3)", width: 88, flexShrink: 0 }}>{n}</span>
      <span style={{ color: "var(--v-ac)", fontWeight: 700, opacity: 0, animation: "pop 0.25s ease forwards", animationDelay: `${statusDelay}s` }}>
        PASS · {ms}ms
      </span>
    </div>
  );
}

const cases: { tag: string; title: string; body: string; span?: boolean }[] = [
  { tag: "CASE 01 · CONTESTS", title: "ICPC-style live contests", body: "Timed rounds, a real freeze window before the end, and a scoreboard that updates the second a verdict lands." },
  { tag: "CASE 02 · DUEL", title: "1v1 duel, best of 3", body: "Ten minutes on the clock. First accepted solution takes the round — not the neatest code, the fastest correct one." },
  { tag: "CASE 03 · ROYALE", title: "Six-player elimination", body: "An ascending difficulty ladder. Miss the timer on a round and you're out — last coder standing wins the lobby." },
  { tag: "CASE 04 · RATING", title: "One Elo, every mode", body: "Contests and matches feed the same rating. Forfeits are detected and settled — nobody stalls a duel by walking away." },
  { tag: "CASE 05 · DEBUGGING", title: "Run before you submit", body: "Test against the sample cases with your own stdin, see your actual stdout and stderr — before it counts against you." },
  { tag: "CASE 06 · BANK", title: "150+ problems and counting", body: "From FizzBuzz to largest-rectangle-in-histogram — curated difficulty, not a random dump." },
  { tag: "CASE 07 · NEW · QUADS", title: "Quad Royale — four-player elimination", body: "The Royale ladder, four across: quicker to fill, quicker to finish. Miss a round's timer and you're out — last one standing takes it. Rated, or warm up against bots, or just watch one live.", span: true },
];

const chips: { label: string; diff: "easy" | "med" | "hard" }[] = [
  { label: "Two Sum", diff: "easy" },
  { label: "Valid Parentheses", diff: "med" },
  { label: "Climbing Stairs", diff: "med" },
  { label: "FizzBuzz", diff: "easy" },
  { label: "Roman to Integer", diff: "med" },
  { label: "Longest Increasing Subsequence", diff: "hard" },
  { label: "0/1 Knapsack", diff: "hard" },
  { label: "Edit Distance", diff: "hard" },
  { label: "Product of Array Except Self", diff: "hard" },
];

function diffColor(d: "easy" | "med" | "hard"): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  return "var(--v-wa)";
}

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "var(--v-ac)", color: "#06210C", fontWeight: 700, fontSize: 14,
  padding: "12px 22px", borderRadius: 8, border: "none", cursor: "pointer",
  fontFamily: "var(--disp)", textDecoration: "none",
};
const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "transparent", color: "var(--txt)", fontWeight: 600, fontSize: 14,
  padding: "11px 20px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer",
  fontFamily: "var(--disp)", textDecoration: "none",
};
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "var(--v-ac)", fontWeight: 700,
};

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useSeo({ path: "/" }); // default homepage title/description

  if (user) return <Navigate to="/contests" replace />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--txt)" }}>
      {/* Nav */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(14,17,22,0.85)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--v-ac)", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17 }}>
              Code<span style={{ color: "var(--v-ac)" }}>Arena</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/login" style={{ ...btnSecondary, padding: "8px 16px", fontSize: 13 }}>Sign in</Link>
            <Link to="/problems/two-sum" style={{ ...btnPrimary, padding: "8px 16px", fontSize: 13 }}>Get started</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
        {/* Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "center", padding: "64px 0 48px" }}>
          <div>
            <span style={eyebrow}>// a competitive judge, live</span>
            <h1 style={{ fontFamily: "var(--disp)", fontSize: "clamp(2.2rem, 5vw, 3.4rem)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.01em", margin: "16px 0 18px" }}>
              Solve. <span style={{ color: "var(--v-ac)" }}>Duel.</span> Climb.
            </h1>
            <p style={{ fontSize: 16, color: "var(--txt-2)", maxWidth: "44ch", marginBottom: 28, lineHeight: 1.7 }}>
              Code Arena is a judge that doesn't wait for a submission window to close.
              Race a stranger head-to-head, outlast a four- or six-player elimination
              ladder, or grind the bank solo — every accepted solution moves your rating.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/problems/two-sum" style={btnPrimary}>Solve one now — no signup →</Link>
              <Link to="/problems" style={btnSecondary}>Browse the problem bank</Link>
            </div>
          </div>

          {/* Terminal mock */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", boxShadow: "0 24px 60px -30px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--txt-3)" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--txt-3)" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--txt-3)" }} />
              <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)" }}>submission #a91f — judging</span>
            </div>
            <div style={{ padding: "20px 18px 24px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.9, minHeight: 250 }}>
              <TermLine delay={0.1}><span style={{ color: "var(--v-ac)" }}>$</span> submit two-sum.cpp --lang=cpp17</TermLine>
              <TermLine delay={0.55} dim>compiling… 0.31s</TermLine>
              <TermLine delay={1.0}>running hidden tests</TermLine>
              <TermCase delay={1.35} statusDelay={1.55} n="test 01/05" ms={4} />
              <TermCase delay={1.7} statusDelay={1.55} n="test 02/05" ms={6} />
              <TermCase delay={2.05} statusDelay={1.9} n="test 03/05" ms={3} />
              <TermCase delay={2.4} statusDelay={1.9} n="test 04/05" ms={5} />
              <TermCase delay={2.75} statusDelay={2.25} n="test 05/05" ms={4} />
              <div style={{ marginTop: 8, opacity: 0, animation: "pop 0.35s ease forwards", animationDelay: "2.9s" }}>
                <span style={{ color: "var(--v-ac)", fontWeight: 700 }}>VERDICT: ACCEPTED</span>
                <span style={{ color: "var(--txt-3)", fontSize: 12 }}> — rating +14 → 1584</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scoreboard */}
        <div style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "26px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, textAlign: "center" }}>
          {[["67", "Problems, easy → hard"], ["6", "Languages judged"], ["2", "Live match modes"], ["<1s", "To first test case"]].map(([n, l]) => (
            <div key={l as string}>
              <div style={{ fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", fontWeight: 700, color: "var(--v-ac)" }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--txt-3)", marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Feature "test cases" */}
        <section style={{ padding: "64px 0 16px" }}>
          <div style={{ maxWidth: "58ch", marginBottom: 36 }}>
            <span style={eyebrow}>// what ships today</span>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)", fontWeight: 700, margin: "12px 0 10px" }}>
              Every claim below is a test case. All of them pass.
            </h2>
            <p style={{ color: "var(--txt-2)", fontSize: 15 }}>No roadmap slides — this is what's live right now.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            {cases.map((c) => (
              <div key={c.tag} style={{ background: "var(--panel)", padding: "24px 22px", gridColumn: c.span ? "1 / -1" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--txt-3)", marginBottom: 10 }}>
                  <span>{c.tag}</span>
                  <span style={{ color: "var(--v-ac)", fontWeight: 700 }}>PASS</span>
                </div>
                <h3 style={{ fontFamily: "var(--disp)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{c.title}</h3>
                <p style={{ color: "var(--txt-2)", fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: c.span ? "70ch" : undefined }}>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: "56px 0" }}>
          <div style={{ maxWidth: "58ch", marginBottom: 32 }}>
            <span style={eyebrow}>// getting in</span>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)", fontWeight: 700, margin: "12px 0 0" }}>
              Three steps between here and a rating change.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
            {[
              ["01 — QUEUE", "Pick your format", "Practice solo, join whatever contest is live, or queue for a Duel or Royale match."],
              ["02 — SHIP", "Write, run, submit", "C++, Python, Java, JavaScript, Go, or Rust. Run it against the samples, then submit when you trust it."],
              ["03 — CLIMB", "Watch the number move", "An accepted verdict is never just a checkmark — it's a rating delta, a scoreboard shift, or a round win."],
            ].map(([num, title, body]) => (
              <div key={num}>
                <div style={{ fontFamily: "var(--mono)", color: "var(--v-ac)", fontWeight: 700, fontSize: 13 }}>{num}</div>
                <h3 style={{ fontFamily: "var(--disp)", fontSize: 15.5, fontWeight: 700, margin: "10px 0 8px" }}>{title}</h3>
                <p style={{ color: "var(--txt-2)", fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Problem chips */}
        <section style={{ padding: "8px 0 64px" }}>
          <div style={{ marginBottom: 18 }}>
            <span style={eyebrow}>// the bank, a preview</span>
            <h2 style={{ fontFamily: "var(--disp)", fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)", fontWeight: 700, margin: "12px 0 0" }}>
              Recognize a few of these?
            </h2>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {chips.map((c) => (
              <span key={c.label} style={{ fontFamily: "var(--mono)", fontSize: 12.5, padding: "7px 13px", border: `1px solid ${diffColor(c.diff)}55`, borderRadius: 100, color: diffColor(c.diff), background: "var(--panel)" }}>
                {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ textAlign: "center", padding: "72px 0 88px", borderTop: "1px solid var(--line)" }}>
          <span style={eyebrow}>// no queue, no waiting room</span>
          <h2 style={{ fontFamily: "var(--disp)", fontSize: "clamp(1.7rem, 3.6vw, 2.3rem)", fontWeight: 700, margin: "14px 0 14px" }}>The lobby's open.</h2>
          <p style={{ color: "var(--txt-2)", maxWidth: "46ch", margin: "0 auto 28px", fontSize: 15 }}>
            Free to play. Six-language judge. A rating that means something the moment you accept your first problem.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/login")} style={btnPrimary}>Enter the arena →</button>
            <Link to="/battle" style={btnSecondary}>See live match modes</Link>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 0 36px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)" }}>CODE ARENA — SELF-HOSTED JUDGE, NO LOCK-IN</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--txt-3)" }}>C++17 · PYTHON3 · JAVA17 · NODE · GO · RUST</span>
        </div>
      </footer>
    </div>
  );
}
