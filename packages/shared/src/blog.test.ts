import { describe, it, expect } from "vitest";
import { BLOG_POSTS } from "./blog.js";

describe("BLOG_POSTS registry", () => {
  it("is non-empty", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has complete, well-formed fields on every post", () => {
    for (const p of BLOG_POSTS) {
      expect(p.slug, "slug").toMatch(/^[a-z0-9-]+$/);
      expect(p.title.length, `${p.slug} title`).toBeGreaterThan(0);
      expect(p.author.length, `${p.slug} author`).toBeGreaterThan(0);
      expect(p.description.length, `${p.slug} description`).toBeGreaterThan(0);
      // ISO date (YYYY-MM-DD) — also used as the sitemap <lastmod>.
      expect(p.date, `${p.slug} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(p.date)), `${p.slug} parseable date`).toBe(false);
    }
  });

  it("is ordered newest first", () => {
    const dates = BLOG_POSTS.map((p) => p.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});
