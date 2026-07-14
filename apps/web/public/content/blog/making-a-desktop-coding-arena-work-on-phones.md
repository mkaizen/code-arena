---
title: "Making a Desktop Coding Arena Work on Phones"
date: "2026-07-14"
author: "Matthew"
description: "Code Arena was built desktop-first — two-pane solve screens and a wide nav bar that fell apart on a phone. Retrofitting it for mobile with one small media-query hook, a tabbed layout, a hamburger menu, and a screenshot-driven way to actually verify it."
---

# Making a Desktop Coding Arena Work on Phones

Code Arena was built desktop-first, and it showed. Every screen where you actually do something — solve a problem, fight a live match — was a fixed two-pane layout: problem statement on the left, code editor on the right, maybe a players sidebar pinned to the far edge. On a 27-inch monitor it's great. On a phone it was unusable: panes crushed to slivers, a top nav bar whose links ran clean off the right edge of the screen.

The thing is, a lot of the traffic that finds a coding site comes from search, on a phone. Someone googles "two sum" and lands on a problem page. If that page is a broken desktop layout, they bounce. So I did a pass to make the core screens genuinely usable on mobile — not a separate mobile app, just the same app that adapts. Here's how it went.

## One hook, not a CSS rewrite

The app has a firm convention: no CSS framework, no Tailwind, just inline style objects driven by a small set of CSS custom properties. That's kept the stack lean, but it means there's no `sm:` / `md:` breakpoint syntax to sprinkle around. Inline styles can't hold a media query.

So the whole responsive effort rests on one tiny hook:

```typescript
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
```

That's it. `const isMobile = useMediaQuery("(max-width: 820px)")` gives every screen a boolean, and the layout branches on it in plain JavaScript. No framework, no new dependency — completely in keeping with [the dependency diet](/blog/the-dependency-diet). The breakpoint lives in one number, used identically everywhere, so "mobile" means exactly the same thing on every screen.

## Two panes become tabs

The recurring desktop pattern is two (or three) panes side by side. The recurring mobile fix is the same everywhere: **collapse the panes into a single column with a tab bar to switch between them.**

- The **problem page** becomes *Problem / Code*.
- The **live match** becomes *Problem / Code / Players (N)* — the roster gets its own tab instead of a pinned sidebar, with the live player count right in the tab label.

Mechanically it's a media-query branch on the container (grid on desktop, flex column on mobile) plus a `display` toggle on each pane driven by which tab is active. The desktop path is left byte-for-byte identical — every mobile rule is gated behind `isMobile`, so there's zero risk of regressing the layout that already worked.

Three small details made the difference between "technically responsive" and "actually feels right":

- **`100dvh`, not `100vh`.** On mobile browsers the address bar shrinks and grows as you scroll, and `100vh` doesn't account for it — the bottom of the editor ends up hidden behind browser chrome. The dynamic viewport unit `100dvh` tracks the *actual* visible height, so the editor and its toolbar always fit.
- **`flex-wrap` on the toolbar.** The row of language selector + Run + Submit + Reset overflows a narrow screen. Letting it wrap to a second line beats a horizontal scrollbar every time.
- **Monaco's `automaticLayout`.** The code editor is display-hidden while you're on the Problem tab. Without `automaticLayout: true`, it measures itself as zero-width at mount and stays blank when you switch to the Code tab; with it, Monaco watches its container and re-lays-out the moment the tab becomes visible.

## The nav bar gets a hamburger

The top bar packed a brand, seven nav links, and a user chip into one non-wrapping row. Below 820px that just… overflowed, on every single page. The fix is the oldest trick in mobile web: hide the inline links and show a hamburger (☰) that toggles a stacked dropdown. Desktop keeps the exact inline bar; mobile gets the menu. Tapping a link — or logging in or out — closes it.

## How do you actually check this?

Here's the part I care about most. It's easy to *write* responsive code; it's easy to be *wrong* about it. A typecheck won't tell you the players tab is empty or the toolbar overlaps the editor. The only way to know is to look at it at phone size.

So the verification loop for every one of these changes was: build the app, serve it, and drive a **headless browser at a real phone viewport** (390×844), take a screenshot of each state, and actually look. Problem tab. Code tab. Players tab. Menu closed, menu open. Then a desktop shot at 1280px to prove I hadn't regressed the layout that already worked.

That loop caught real things. An early build screenshotted the *desktop* layout at phone width — because I'd forgotten to rebuild and was serving a stale bundle; the picture, not the code, is what gave it away. Another time a mock match let me see the players roster render full-width with the right status colors before it ever touched production. "Render it and look at it" remains the only verification I fully trust for anything visual.

## What it adds up to

None of these changes is clever. A media-query hook, some `display` toggles, a hamburger, a few viewport-unit fixes. But together they turn a desktop-only tool into one you can actually use on the device most people reach for first — the same React app, adapting, with the desktop experience untouched.

A few things I'd carry to any desktop-first app going mobile:

- **Centralize the breakpoint.** One hook, one number. "Mobile" should mean the same thing on every screen, or you'll get subtly different behavior page to page.
- **Gate every mobile rule behind the query.** If the desktop path is untouched by construction, you can't regress it.
- **Use `100dvh` and `automaticLayout`.** The two mobile gotchas that bite editors specifically — clipped viewports and zero-size measurement — each have a one-property fix.
- **Verify at phone size, with your eyes.** Screenshots at a real viewport catch what no typecheck can, and they cost about a minute.
