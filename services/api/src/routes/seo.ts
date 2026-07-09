import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { env } from "../env.js";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Dynamic sitemap so every problem URL is discoverable by crawlers as the bank
 * grows — the backbone of the problem bank's programmatic SEO. Served at the
 * site root via a Caddy route (see Caddyfile), not under /api.
 */
export async function seoRoutes(app: FastifyInstance) {
  app.get("/sitemap.xml", async (_req, reply) => {
    const base = env.WEB_BASE_URL.replace(/\/$/, "");
    const problems = await prisma.problem.findMany({
      select: { slug: true, createdAt: true },
      orderBy: { ratingValue: "asc" },
    });

    const staticUrls = [
      { loc: `${base}/`, priority: "1.0", changefreq: "daily" },
      { loc: `${base}/problems`, priority: "0.9", changefreq: "daily" },
      { loc: `${base}/daily`, priority: "0.8", changefreq: "daily" },
      { loc: `${base}/leaderboard`, priority: "0.6", changefreq: "daily" },
    ];

    const urls = [
      ...staticUrls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`),
      ...problems.map((p) =>
        `  <url><loc>${xmlEscape(`${base}/problems/${p.slug}`)}</loc><lastmod>${p.createdAt.toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
      ),
    ].join("\n");

    reply
      .header("Content-Type", "application/xml; charset=utf-8")
      .header("Cache-Control", "public, max-age=3600")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  });
}
