// Build-time prerendering (SSG) for SEO. Runs after `vite build`, reading the
// built dist/index.html shell and the seed's problem data, and emits a static
// HTML file per problem (and a problem index) with the real title, meta tags,
// and a content snapshot baked into #root.
//
// The app mounts with createRoot(), which clears #root and renders the live
// SPA — so the snapshot is purely what crawlers and no-JS clients see in the
// initial HTML; interactive users get the full app a moment later. Content is
// sourced from services/api/prisma/seed.ts (the canonical problem data).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Swap a single-line meta/title/link value in the template. */
function setMeta(html, pattern, replacement) {
  return html.replace(pattern, replacement);
}

function render({ title, description, path, snapshot }) {
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
  write(`problems/${p.slug}`, render({ title, description, path: `/problems/${p.slug}`, snapshot }));
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
}));

console.log(`prerendered ${PROBLEMS.length} problem pages + problem index`);
