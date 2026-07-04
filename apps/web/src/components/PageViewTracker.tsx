import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPageview } from "../analytics.js";

/**
 * Fires a GA4 page_view on every client-side route change. The initial load
 * is already tracked by the gtag('config', ...) call in index.html, so this
 * skips the first render to avoid double-counting the landing pageview.
 */
export function PageViewTracker() {
  const location = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    trackPageview(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
