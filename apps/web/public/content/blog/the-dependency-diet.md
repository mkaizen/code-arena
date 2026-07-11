---
title: "The Dependency Diet: Building Features Without the Bloat"
date: "2026-08-04"
author: "Matthew"
description: "A running theme in Code Arena's development: reach for a new npm package last, not first. Real examples — canvas share cards, email over fetch, kernel memory accounting, no CSS framework — and when we did add a dependency anyway."
---

# The Dependency Diet: Building Features Without the Bloat

There's a reflex in modern web development: you need a thing, so you `npm install` a package that does the thing. It feels productive. It usually is — for about a week, until that package has a breaking change, a security advisory, a peer-dependency conflict, or a transitive tree of forty sub-packages you've never read.

While building Code Arena, we adopted a quiet rule: **reach for a new dependency last, not first.** Not out of purism — plenty of our stack is other people's excellent code — but because a dependency is a long-term liability you take on to save some short-term effort, and that trade is worth making far less often than it feels.

Here are the cases where we said no, one where we said yes, and the rule of thumb that decided each.

## Shareable win cards: `<canvas>`, not a screenshot library

When a duel finishes, players can download a shareable result card — an image with the winner, the rating change, the mode. The obvious path is a library like `html2canvas` or `dom-to-image`: render some DOM, screenshot it to a PNG.

We drew the card by hand instead, with the Canvas2D API — a few `fillText` and `fillRect` calls. It's maybe sixty lines. In exchange we skipped a heavyweight dependency famous for subtle font-rendering and cross-origin quirks, and we got pixel-exact control over a small, stable design that never needed to match arbitrary DOM. The same hand-rolled approach later produced the streak cards and the Open Graph preview image. One tiny module, three features, zero dependencies.

## Email: `fetch`, not an SDK

Notifications — contest reminders, streak nudges, "a friend joined with your invite" — go out over email. The reflex is to add the provider's official SDK, or `nodemailer`.

Instead, sending an email is a single `fetch` to an HTTPS endpoint with a JSON body. No SDK, no transport abstraction, no client to construct and configure. The mailer is provider-agnostic and *safe by default*: with no API key set, it logs the message instead of sending, so the whole app runs end-to-end with no mail provider at all. That "opt-in infrastructure" property fell out naturally from keeping the integration to a thin function rather than a framework.

## Peak memory: the kernel, not a profiler

The judge reports how much memory each submission used. You could imagine reaching for a profiling library or a memory-monitoring package. But the Linux kernel already tracks a process's peak memory exactly, for free, in the cgroup it runs in. The "dependency" is one `cat /sys/fs/cgroup/memory.peak`. No package can beat *free and exact*, and there's nothing to keep updated.

## Styling: inline styles and CSS variables, not a framework

The app has no CSS framework. Components style themselves with plain inline style objects driven by a small set of CSS custom properties (`--ink`, `--panel`, `--v-ac`, and friends). No build-time class generation, no framework config, no purge step, no version treadmill.

This one had a sharp edge worth sharing. A blog page was contributed using utility classes — `text-white`, `bg-gray-800`, `prose` — for a framework the project doesn't include. It compiled without a single error and rendered as invisible black text on a dark background, because those classes simply *don't exist here* and silently do nothing. The lesson cuts both ways: not having a framework kept the stack lean, but "no framework" is itself a convention you have to know. Consistency is a dependency too — just an unversioned one.

## Prerendering: reuse what's already installed

For SEO we prerender problem and blog pages to static HTML at build time. Rendering the blog markdown to HTML could have meant adding a markdown-to-HTML library. But the app already depends on `react-markdown` to render posts in the browser — so the prerender step imports that same component and runs it through React's `renderToStaticMarkup`. The prerendered HTML is byte-identical to what the client produces, and we added nothing new. The cheapest dependency is the one you already have.

## The one time we said yes — and the tail it came with

We're not zealots. `react-markdown` *is* a dependency we chose, because writing a correct, safe Markdown parser is genuinely more work and risk than owning the feature ourselves. That's the whole test: **add a dependency when building it yourself would cost more than owning the dependency forever.** Markdown parsing clears that bar. Drawing a rectangle on a canvas does not.

But even the right dependency has a tail. When that package was added to the manifest but not actually installed in one environment, the entire web build failed with a module-not-found error — a reminder that a dependency isn't "done" when you type its name into `package.json`. It has to resolve, lock, install, and build everywhere the code runs. That tail is exactly the cost you're signing up for, and it's why the bar is high.

## The rule of thumb

Before every `npm install`, one question: **would building this myself cost more than owning this dependency forever?** "Forever" is the load-bearing word — it means the upgrades, the advisories, the lockfile churn, the bundle weight, the breakage at the worst possible moment.

- If the feature is small, stable, and well-understood (draw a card, POST a JSON body, read a kernel file) — build it. It's less code than you think, and it never breaks on someone else's schedule.
- If the feature is large, subtle, and a solved problem (parse Markdown, hash passwords, run a job queue) — take the dependency, and take it seriously.

A lean dependency tree isn't an aesthetic. It's fewer things that can break, fewer things to patch at 2am, and a codebase where you actually understand what's running. Most of the time, the package you didn't install is the best one you never had to maintain.
