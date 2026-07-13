// Build-time prerendering (SSG) for SEO. Runs after `vite build`, reading the
// built dist/index.html shell and the seed's problem data, and emits a static
// HTML file per problem (and a problem index) with the real title, meta tags,
// and a content snapshot baked into #root.
//
// The app mounts with createRoot(), which clears #root and renders the live
// SPA — so the snapshot is purely what crawlers and no-JS clients see in the
// initial HTML; interactive users get the full app a moment later. Content is
// sourced from services/api/prisma/seed.ts (the canonical problem data).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";

const WEB_DIR = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(WEB_DIR, "dist");
const SITE = "https://codearena.space";

const template = readFileSync(join(DIST, "index.html"), "utf8");

// Extract the two canonical data literals from the seed (same approach the
// repo's integrity checks use). Read relative to the build cwd (repo root).
const seed = readFileSync("services/api/prisma/seed.ts", "utf8");
const PROBLEMS = eval(seed.match(/const PROBLEMS: ProblemSeed\[\] = (\[[\s\S]*?\n\]);/)[1]);
const EDITORIALS = eval("(" + seed.match(/const EDITORIALS: Record<string, string> = (\{[\s\S]*?\n\});/)[1] + ")");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripHtml = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
const diffLabel = (d) => (d === "easy" ? "Easy" : d === "med" ? "Medium" : "Hard");

// One-line pitch reused across the JSON-LD, llms.txt, and page copy.
const INTRO =
  "Code Arena is a competitive-programming practice platform with real-time judging: " +
  "1v1 duels, six-player elimination matches, ghost races against past solvers, and a bank " +
  "of classic coding-interview problems. Every problem has a statement, worked examples, a " +
  "live judge across six languages, and a solution editorial.";

// Publisher/provider entity shared by every schema.org block.
const ORG = { "@type": "Organization", name: "Code Arena", url: SITE, logo: `${SITE}/og-image.png` };

// Serialize JSON-LD for embedding in HTML. Escaping "<" as < keeps the
// JSON valid while making it impossible for any string value (e.g. one that
// contains "</script>") to break out of the surrounding <script> tag.
const ldScript = (objs) =>
  objs.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("");

const crumbs = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
});

// HTML → readable plain text with paragraph breaks preserved, for llms-full.txt.
function htmlToText(html) {
  return html
    .replace(/<\/(p|h[1-6]|pre|li|ul|ol|div|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<sup>(.*?)<\/sup>/gi, "^$1")
    .replace(/<sub>(.*?)<\/sub>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&le;/g, "≤").replace(/&ge;/g, "≥").replace(/&times;/g, "×")
    .replace(/&middot;/g, "·").replace(/&rarr;/g, "→").replace(/&ndash;/g, "–")
    .replace(/&lfloor;/g, "⌊").replace(/&rfloor;/g, "⌋").replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Collapse HTML to a single clean line (entities decoded, superscripts kept as
// "^"), clipped to n chars at a word boundary — for citable description/answer
// fields where the entity-dropping stripHtml would mangle "10⁹" into "10 9".
function oneLine(html, n) {
  const text = htmlToText(html).replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!n || text.length <= n) return text;
  const cut = text.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
}

// Pull a "Time … / Space …" complexity line out of an editorial, if present —
// the kind of self-contained fact answer engines quote directly.
function complexityOf(editorialHtml) {
  const text = stripHtml(editorialHtml);
  const time = text.match(/Time:\s*(O\([^)]*\)[^.]*)/i);
  const space = text.match(/Space:\s*(O\([^)]*\)[^.]*)/i);
  if (!time && !space) return null;
  return [time && `Time ${time[1].trim()}`, space && `Space ${space[1].trim()}`].filter(Boolean).join("; ");
}

/** Swap a single-line meta/title/link value in the template. */
function setMeta(html, pattern, replacement) {
  return html.replace(pattern, replacement);
}

function render({ title, description, path, snapshot, jsonLd }) {
  const url = `${SITE}${path}`;
  let html = template;
  html = setMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = setMeta(html, /(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`);
  html = setMeta(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  html = setMeta(html, /(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`);
  html = setMeta(html, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  html = setMeta(html, /(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(description)}$2`);
  html = setMeta(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`);
  html = setMeta(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`);
  html = html.replace('<div id="root"></div>', `<div id="root">${snapshot}</div>`);
  if (jsonLd && jsonLd.length) html = html.replace("</head>", `${ldScript(jsonLd)}</head>`);
  return html;
}

// Flat .html files (e.g. dist/problems/two-sum.html) rather than
// dir/index.html, so Caddy serves them for the clean URL via a file matcher
// without the directory trailing-slash redirect that would break canonicals.
function write(routePath, html) {
  const file = join(DIST, `${routePath}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ── Per-problem pages ──────────────────────────────────────────────────────
for (const p of PROBLEMS) {
  const title = `${p.title} — Code Arena`;
  const description = `Solve ${p.title} (${diffLabel(p.difficulty)}) on Code Arena — statement, examples, a live judge, and a solution editorial. ${stripHtml(p.statement).slice(0, 90)}`;
  const editorial = EDITORIALS[p.slug] || "";
  const snapshot =
    `<main style="max-width:760px;margin:0 auto;padding:24px">` +
    `<h1>${esc(p.title)}</h1>` +
    `<p>${diffLabel(p.difficulty)} · rating ${p.ratingValue}${p.tags?.length ? " · " + p.tags.map(esc).join(", ") : ""}</p>` +
    p.statement +
    (editorial ? `<section><h2>Editorial</h2>${editorial}</section>` : "") +
    `<p><a href="/problems/${esc(p.slug)}">Open ${esc(p.title)} in Code Arena →</a></p>` +
    `</main>`;

  // Structured data: a practice problem is a LearningResource; the editorial
  // answers "how do you solve X?" as an FAQPage so answer engines can lift it.
  const learning = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: p.title,
    url: `${SITE}/problems/${p.slug}`,
    description: oneLine(p.statement, 300),
    learningResourceType: "Coding practice problem",
    educationalLevel: diffLabel(p.difficulty),
    educationalUse: "practice",
    ...(p.tags?.length ? { teaches: p.tags, keywords: p.tags.join(", ") } : {}),
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: ORG,
    publisher: ORG,
  };
  const faq = [];
  if (editorial) {
    faq.push({
      "@type": "Question",
      name: `How do you solve ${p.title}?`,
      acceptedAnswer: { "@type": "Answer", text: oneLine(editorial, 600) },
    });
    const cx = complexityOf(editorial);
    if (cx) faq.push({
      "@type": "Question",
      name: `What is the time and space complexity of ${p.title}?`,
      acceptedAnswer: { "@type": "Answer", text: cx },
    });
  }
  const jsonLd = [
    learning,
    crumbs([
      { name: "Home", url: `${SITE}/` },
      { name: "Problems", url: `${SITE}/problems` },
      { name: p.title, url: `${SITE}/problems/${p.slug}` },
    ]),
  ];
  if (faq.length) jsonLd.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq });

  write(`problems/${p.slug}`, render({ title, description, path: `/problems/${p.slug}`, snapshot, jsonLd }));
}

// ── Problem index (internal linking + crawl discovery) ─────────────────────
const listSnapshot =
  `<main style="max-width:760px;margin:0 auto;padding:24px">` +
  `<h1>Practice Problems</h1>` +
  `<p>Browse Code Arena's problem bank of classic interview questions and algorithm challenges.</p><ul>` +
  PROBLEMS.map((p) => `<li><a href="/problems/${esc(p.slug)}">${esc(p.title)}</a> — ${diffLabel(p.difficulty)}</li>`).join("") +
  `</ul></main>`;
write("problems", render({
  title: "Practice Problems — Code Arena",
  description: "Browse Code Arena's problem bank — classic interview questions and algorithm challenges across easy, medium, and hard, each with a live judge, editorial, and speed leaderboards.",
  path: "/problems",
  snapshot: listSnapshot,
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Practice Problems",
      url: `${SITE}/problems`,
      description: "Code Arena's bank of classic coding-interview and algorithm problems.",
      isPartOf: { "@type": "WebSite", name: "Code Arena", url: SITE },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: PROBLEMS.length,
        itemListElement: PROBLEMS.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.title,
          url: `${SITE}/problems/${p.slug}`,
        })),
      },
    },
    crumbs([
      { name: "Home", url: `${SITE}/` },
      { name: "Problems", url: `${SITE}/problems` },
    ]),
  ],
}));

// ── Blog: render each markdown post's body to HTML (identical to the client's
//    react-markdown output) and bake it into the initial HTML for SEO. ────────
function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

const BLOG_DIR = join(WEB_DIR, "public/content/blog");
const posts = [];
if (existsSync(BLOG_DIR)) {
  for (const file of readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md")).sort()) {
    const slug = file.replace(/\.md$/, "");
    const { meta, body } = parseFrontmatter(readFileSync(join(BLOG_DIR, file), "utf8"));
    const bodyHtml = renderToStaticMarkup(React.createElement(ReactMarkdown, null, body));
    posts.push({ slug, meta, body });
    const title = `${meta.title || slug} — Code Arena`;
    const description = meta.description || stripHtml(bodyHtml).slice(0, 150);
    const snapshot =
      `<main style="max-width:740px;margin:0 auto;padding:24px">` +
      (meta.date || meta.author ? `<p>${esc(meta.date || "")}${meta.date && meta.author ? " · " : ""}${esc(meta.author || "")}</p>` : "") +
      `<article class="blog-article">${bodyHtml}</article>` +
      `</main>`;
    const posting = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: meta.title || slug,
      description,
      url: `${SITE}/blog/${slug}`,
      mainEntityOfPage: `${SITE}/blog/${slug}`,
      ...(meta.date ? { datePublished: meta.date, dateModified: meta.date } : {}),
      author: { "@type": "Person", name: meta.author || "Code Arena" },
      publisher: ORG,
      inLanguage: "en",
    };
    write(`blog/${slug}`, render({
      title, description, path: `/blog/${slug}`, snapshot,
      jsonLd: [
        posting,
        crumbs([
          { name: "Home", url: `${SITE}/` },
          { name: "Blog", url: `${SITE}/blog` },
          { name: meta.title || slug, url: `${SITE}/blog/${slug}` },
        ]),
      ],
    }));
  }

  const blogList =
    `<main style="max-width:780px;margin:0 auto;padding:24px">` +
    `<h1>Engineering Blog</h1><p>Deep dives on how Code Arena is built.</p><ul>` +
    posts.map((p) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.meta.title || p.slug)}</a>${p.meta.description ? " — " + esc(p.meta.description) : ""}</li>`).join("") +
    `</ul></main>`;
  write("blog", render({
    title: "Engineering Blog — Code Arena",
    description: "Engineering deep-dives from the team building Code Arena — real-time judging, Docker sandboxing, WebSockets, and competitive-programming infrastructure.",
    path: "/blog",
    snapshot: blogList,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Engineering Blog",
        url: `${SITE}/blog`,
        publisher: ORG,
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.meta.title || p.slug,
          url: `${SITE}/blog/${p.slug}`,
          ...(p.meta.date ? { datePublished: p.meta.date } : {}),
        })),
      },
      crumbs([
        { name: "Home", url: `${SITE}/` },
        { name: "Blog", url: `${SITE}/blog` },
      ]),
    ],
  }));
}

// ── llms.txt / llms-full.txt (llmstxt.org) ─────────────────────────────────
// A curated, machine-readable index of the site's content for LLMs and
// answer engines: llms.txt links every problem + post; llms-full.txt inlines
// the full statement and editorial text so a model can cite without crawling.
let llms = `# Code Arena\n\n> ${INTRO}\n\n`;
llms += `- Site: ${SITE}\n- Problems: ${SITE}/problems\n- Blog: ${SITE}/blog\n\n`;
llms += `## Problems\n\n`;
for (const p of PROBLEMS) {
  const tags = p.tags?.length ? ` · ${p.tags.join(", ")}` : "";
  llms += `- [${p.title}](${SITE}/problems/${p.slug}): ${diffLabel(p.difficulty)}${tags}. ${oneLine(p.statement, 110)}\n`;
}
if (posts.length) {
  llms += `\n## Blog\n\n`;
  for (const p of posts) llms += `- [${p.meta.title || p.slug}](${SITE}/blog/${p.slug})${p.meta.description ? `: ${p.meta.description}` : ""}\n`;
}
writeFileSync(join(DIST, "llms.txt"), llms);

let full = `# Code Arena — Full Content Export\n\n${INTRO}\n\nURL: ${SITE}\n\n# Problems (${PROBLEMS.length})\n\n`;
for (const p of PROBLEMS) {
  full += `## ${p.title} (${diffLabel(p.difficulty)})\nURL: ${SITE}/problems/${p.slug}\n`;
  if (p.tags?.length) full += `Tags: ${p.tags.join(", ")}\n`;
  full += `\n${htmlToText(p.statement)}\n`;
  if (EDITORIALS[p.slug]) full += `\n### Editorial\n${htmlToText(EDITORIALS[p.slug])}\n`;
  full += `\n---\n\n`;
}
if (posts.length) {
  full += `# Blog\n\n`;
  for (const p of posts) {
    full += `## ${p.meta.title || p.slug}\nURL: ${SITE}/blog/${p.slug}\n`;
    if (p.meta.date || p.meta.author) full += `${p.meta.date || ""}${p.meta.date && p.meta.author ? " · " : ""}${p.meta.author || ""}\n`;
    full += `\n${p.body.trim()}\n\n---\n\n`;
  }
}
writeFileSync(join(DIST, "llms-full.txt"), full);

console.log(`prerendered ${PROBLEMS.length} problem pages + problem index + ${posts.length} blog post(s) + blog index; wrote llms.txt (${(llms.length / 1024).toFixed(1)}kb) + llms-full.txt (${(full.length / 1024).toFixed(1)}kb)`);
