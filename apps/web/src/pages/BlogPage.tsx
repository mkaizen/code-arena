import { Link } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";
import { useSeo } from "../hooks/useSeo.js";

// Add new posts here; the markdown body lives in public/content/blog/<slug>.md.
const posts = [
  {
    slug: "scaling-the-arena",
    title: "Building Code Arena: Scaling WebSockets & Docker Sandboxes",
    date: "2026-07-14",
    author: "Matthew",
    description:
      "A deep dive into the architecture: BullMQ submission queues, a hardened Docker + cgroups sandbox, Redis pub/sub verdict streaming over per-user WebSockets, and the real-time Battle Royale round engine.",
  },
];

export function BlogPage() {
  useSeo({
    title: "Engineering Blog",
    description: "Engineering deep-dives from the team building Code Arena — real-time judging, Docker sandboxing, WebSockets, and competitive-programming infrastructure.",
    path: "/blog",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 30, fontWeight: 700, color: "var(--txt)", marginBottom: 8 }}>
          Engineering <span style={{ color: "var(--v-ac)" }}>Blog</span>
        </h1>
        <p style={{ color: "var(--txt-2)", fontSize: 15, marginBottom: 32 }}>
          Deep dives on how Code Arena is built.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              style={{
                display: "block", textDecoration: "none",
                background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "22px 24px",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--txt-3)", fontFamily: "var(--mono)", marginBottom: 8 }}>
                {post.date} · {post.author}
              </div>
              <h2 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 700, color: "var(--txt)", margin: "0 0 8px" }}>
                {post.title}
              </h2>
              <p style={{ color: "var(--txt-2)", fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
                {post.description}
              </p>
              <span style={{ color: "var(--v-ac)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13 }}>
                Read full post →
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
