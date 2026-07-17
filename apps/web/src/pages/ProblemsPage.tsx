import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tierOf, tagLabel } from "@arena/shared";
import { TopBar } from "../components/TopBar.js";
import { api, type ProblemSummary } from "../api.js";
import { useAuth } from "../ctx/AuthContext.js";
import { useSeo } from "../hooks/useSeo.js";

type Difficulty = "all" | "easy" | "med" | "hard";

const DIFF_LABELS: Record<Difficulty, string> = {
  all: "All",
  easy: "Easy",
  med: "Med",
  hard: "Hard",
};

const DIFF_FULL: Record<"easy" | "med" | "hard", string> = { easy: "Easy", med: "Medium", hard: "Hard" };

function diffColor(d: string): string {
  if (d === "easy") return "var(--v-ac)";
  if (d === "med") return "var(--v-tle)";
  if (d === "hard") return "var(--v-wa)";
  return "var(--txt-3)";
}

export function ProblemsPage() {
  const { user } = useAuth();
  // These pages double as topic/difficulty hubs (/problems/tag/:tag,
  // /problems/difficulty/:level) — indexable landing pages that preset the filter.
  const { tag: tagParam, level: levelParam } = useParams<{ tag?: string; level?: string }>();
  const hubLevel = levelParam === "easy" || levelParam === "med" || levelParam === "hard" ? levelParam : null;
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [diff, setDiff] = useState<Difficulty>(hubLevel ?? "all");
  const [activeTag, setActiveTag] = useState<string>(tagParam ?? "");
  const navigate = useNavigate();

  // Sync the filter to the URL when navigating between hubs (the component
  // stays mounted, only the route params change).
  useEffect(() => {
    setActiveTag(tagParam ?? "");
    setDiff(hubLevel ?? "all");
  }, [tagParam, hubLevel]);

  useSeo(
    tagParam
      ? { title: `${tagLabel(tagParam)} Problems`, description: `Practice ${tagLabel(tagParam)} coding problems on Code Arena — from easy to hard, each with a live judge, worked examples, and a solution editorial.`, path: `/problems/tag/${tagParam}` }
      : hubLevel
        ? { title: `${DIFF_FULL[hubLevel]} Coding Problems`, description: `Practice ${DIFF_FULL[hubLevel].toLowerCase()} coding problems on Code Arena — each with a live judge, worked examples, and a solution editorial.`, path: `/problems/difficulty/${hubLevel}` }
        : { title: "Practice Problems", description: "Browse Code Arena's problem bank — classic interview questions and algorithm challenges across easy, medium, and hard, each with a live judge and speed leaderboards.", path: "/problems" },
  );

  useEffect(() => {
    setLoading(true);
    const params: { difficulty?: string; tag?: string } = {};
    if (diff !== "all") params.difficulty = diff;
    if (activeTag) params.tag = activeTag;

    api.problems(params)
      .then(setProblems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [diff, activeTag]);

  // Mark which problems the signed-in user has already solved.
  useEffect(() => {
    if (!user) { setSolvedIds(new Set()); return; }
    api.submissions()
      .then((subs) => setSolvedIds(new Set(subs.filter((s) => s.verdict === "ACCEPTED").map((s) => s.problemId))))
      .catch(() => {});
  }, [user]);

  // Collect all unique tags
  const allTags = Array.from(new Set(problems.flatMap((p) => p.tags))).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 900, width: "100%", margin: "0 auto", padding: "32px 20px" }}>
        {(tagParam || hubLevel) && (
          <Link to="/problems" style={{ fontSize: 12, color: "var(--txt-3)", textDecoration: "none", fontFamily: "var(--disp)", fontWeight: 600 }}>
            ← All problems
          </Link>
        )}
        <h1
          style={{
            fontFamily: "var(--disp)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--txt)",
            marginTop: tagParam || hubLevel ? 6 : 0,
            marginBottom: 20,
          }}
        >
          {tagParam ? `${tagLabel(tagParam)} Problems` : hubLevel ? `${DIFF_FULL[hubLevel]} Coding Problems` : "Problems"}
        </h1>

        {/* Filter bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20, alignItems: "center" }}>
          {(["all", "easy", "med", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDiff(d)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "1px solid",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--disp)",
                transition: "all 0.15s",
                background: diff === d ? (d === "all" ? "var(--panel-2)" : diffColor(d)) : "transparent",
                borderColor: diff === d ? (d === "all" ? "var(--line)" : diffColor(d)) : "var(--line)",
                color: diff === d ? (d === "all" ? "var(--txt)" : "#06210C") : d === "all" ? "var(--txt-2)" : diffColor(d),
              }}
            >
              {DIFF_LABELS[d]}
            </button>
          ))}

          {allTags.length > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
              {allTags.slice(0, 10).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 100,
                    border: "1px solid",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: activeTag === tag ? "rgba(76,141,255,0.15)" : "transparent",
                    borderColor: activeTag === tag ? "rgba(76,141,255,0.4)" : "var(--line)",
                    color: activeTag === tag ? "var(--v-judge)" : "var(--txt-3)",
                  }}
                >
                  {tag}
                </button>
              ))}
            </>
          )}
        </div>

        {loading && <div style={{ color: "var(--txt-2)", textAlign: "center", padding: 48 }}>Loading…</div>}
        {error && (
          <div style={{ color: "var(--v-wa)", padding: 12, background: "rgba(255,92,92,0.1)", borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 84px 72px 108px 1fr",
                padding: "10px 16px",
                borderBottom: "1px solid var(--line)",
                fontSize: 11,
                letterSpacing: "0.05em",
                color: "var(--txt-3)",
                fontWeight: 600,
              }}
            >
              <span>TITLE</span>
              <span>DIFFICULTY</span>
              <span>RATING</span>
              <span>SOLVED</span>
              <span>TAGS</span>
            </div>

            {problems.length === 0 && (
              <div style={{ color: "var(--txt-3)", textAlign: "center", padding: 32 }}>
                No problems match your filters.
              </div>
            )}

            {problems.map((p, i) => {
              const tier = tierOf(p.ratingValue);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/problems/${p.slug}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 84px 72px 108px 1fr",
                    padding: "12px 16px",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: i < problems.length - 1 ? "1px solid var(--line-soft)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    alignItems: "center",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--txt)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      title={solvedIds.has(p.id) ? "Solved" : undefined}
                      style={{ color: "var(--v-ac)", fontWeight: 700, width: 14, flexShrink: 0, visibility: solvedIds.has(p.id) ? "visible" : "hidden" }}
                    >
                      ✓
                    </span>
                    {p.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: diffColor(p.difficulty),
                      display: "inline-block",
                    }}
                  >
                    {p.difficulty === "easy" ? "Easy" : p.difficulty === "med" ? "Medium" : "Hard"}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: tier.color, fontWeight: 600 }}>
                    {p.ratingValue}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--txt-2)" }}>{p.solved}</span>
                    {p.acceptance != null && (
                      <span style={{ fontSize: 10, color: "var(--txt-3)" }}>{p.acceptance}% AC</span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {p.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 100,
                          background: "var(--panel-2)",
                          color: "var(--txt-3)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
