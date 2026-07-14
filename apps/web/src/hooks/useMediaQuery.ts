import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render when it changes. Used to switch
 * the gameplay screens between their desktop two-pane layout and a stacked,
 * tabbed mobile layout. SSR/prerender-safe: assumes desktop until mounted.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
