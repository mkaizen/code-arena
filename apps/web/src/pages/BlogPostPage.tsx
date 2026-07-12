import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { TopBar } from "../components/TopBar.js";
import { ShareButtons } from "../components/ShareButtons.js";
import { useSeo } from "../hooks/useSeo.js";

interface Frontmatter {
  title?: string;
  description?: string;
  date?: string;
  author?: string;
}

/** Minimal YAML-ish frontmatter parser for the leading ---...--- block. */
function parseFrontmatter(text: string): { meta: Frontmatter; body: string } {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: Frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1] as keyof Frontmatter] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [body, setBody] = useState("");
  const [meta, setMeta] = useState<Frontmatter>({});
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    fetch(`/content/blog/${slug}.md`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.text();
      })
      .then((text) => {
        const { meta, body } = parseFrontmatter(text);
        setMeta(meta);
        setBody(body);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  useSeo({
    title: meta.title ?? "Blog",
    description: meta.description,
    path: slug ? `/blog/${slug}` : "/blog",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--ink)" }}>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 740, width: "100%", margin: "0 auto", padding: "40px 20px" }}>
        <Link to="/blog" style={{ color: "var(--txt-2)", fontSize: 13, fontFamily: "var(--disp)", textDecoration: "none" }}>
          ← Back to all posts
        </Link>

        {status === "loading" && <div style={{ color: "var(--txt-3)", padding: "40px 0" }}>Loading…</div>}
        {status === "error" && (
          <div style={{ padding: "40px 0" }}>
            <h1 style={{ fontFamily: "var(--disp)", color: "var(--txt)" }}>Post not found</h1>
            <p style={{ color: "var(--txt-2)" }}>That post doesn't exist yet. <Link to="/blog" style={{ color: "var(--v-ac)" }}>See all posts.</Link></p>
          </div>
        )}
        {status === "ok" && (
          <>
            {(meta.date || meta.author) && (
              <div style={{ color: "var(--txt-3)", fontSize: 13, fontFamily: "var(--mono)", margin: "20px 0 0" }}>
                {meta.date}{meta.date && meta.author ? " · " : ""}{meta.author}
              </div>
            )}
            <article className="blog-article">
              <ReactMarkdown>{body}</ReactMarkdown>
            </article>
            <ShareButtons title={meta.title ?? "Code Arena Engineering Blog"} url={`https://codearena.space/blog/${slug}`} />
          </>
        )}
      </main>
    </div>
  );
}
