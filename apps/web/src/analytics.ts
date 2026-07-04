// Thin wrapper around the gtag.js loaded in index.html. Declared here so
// TypeScript knows about window.gtag/dataLayer; the actual script tag lives
// in apps/web/index.html since it must load before React does.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Fire a GA4 page_view for a client-side route change (SPA navigation). */
export function trackPageview(path: string, title?: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title ?? document.title,
  });
}
