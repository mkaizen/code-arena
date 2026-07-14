import { useEffect } from "react";

const SITE = "Code Arena";
const DEFAULT_DESC =
  "Real-time 1v1 duels, six-player elimination matches, and a large problem bank — every accepted solution moves your rating.";

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

interface Seo {
  /** Page title; " — Code Arena" is appended unless `bare` is set. */
  title?: string;
  description?: string;
  /** Path (e.g. "/problems/two-sum") used for canonical + og:url. */
  path?: string;
  bare?: boolean;
}

/**
 * Sets per-route title/description/canonical/OG tags. Googlebot renders JS and
 * picks these up, so distinct pages finally get distinct search snippets
 * instead of the one static homepage title. (Non-JS social scrapers still see
 * the static index.html tags — full prerender/SSR is the follow-up for those.)
 */
export function useSeo({ title, description, path, bare }: Seo) {
  useEffect(() => {
    const fullTitle = title ? (bare ? title : `${title} — ${SITE}`) : `${SITE} — Solve. Duel. Climb.`;
    const desc = description ?? DEFAULT_DESC;
    document.title = fullTitle;
    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    upsertMeta('meta[property="og:description"]', "property", "og:description", desc);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", desc);
    if (path) {
      const url = `https://codearena.space${path}`;
      upsertCanonical(url);
      upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    }
  }, [title, description, path, bare]);
}

/** Strips HTML and truncates to a clean ~155-char meta description. */
export function metaFromHtml(html: string, max = 155): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
