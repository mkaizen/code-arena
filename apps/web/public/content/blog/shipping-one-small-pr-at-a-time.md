---
title: "Shipping a Platform One Small PR at a Time"
date: "2026-06-23"
author: "Matthew"
description: "The development workflow behind Code Arena: small, single-purpose pull requests, an always-deployable main, verify-before-merge, and strict branch discipline — how a whole platform got built in slices that each ship on their own."
---

# Shipping a Platform One Small PR at a Time

Code Arena is a real-time competitive coding platform: a judge that sandboxes untrusted code, live Battle Royale matches over WebSockets, contests with an Elo ladder, a growth stack, and a fully prerendered SEO layer. It was not built as one heroic push. It was built as **dozens of small pull requests**, each one doing a single thing, each one shippable on its own.

That constraint — every change is small, self-contained, and deployable — shaped the whole project more than any individual feature did. Here's the workflow, and why it works.

## One PR, one purpose

The rule is boring and strict: a pull request does *one* thing. "Add rated matches." "Fix the seed-abort bug." "Prerender the blog." Not "add matches and also refactor the queue and tweak the landing page." When a change starts to sprawl, that's the signal to split it.

The payoff is compounding. Small PRs are:

- **Reviewable at a glance.** A 200-line diff with one job is something you can actually reason about. A 2,000-line diff with five jobs is something you rubber-stamp.
- **Safe to deploy immediately.** Each PR leaves `main` in a working, releasable state, so shipping is continuous instead of a scary big-bang event.
- **Cheap to revert.** If a change misbehaves in production, you roll back one small, understood thing — not a tangle of unrelated work.
- **A clean history.** Six months from now, "why does this exist?" has a one-sentence answer in the PR that introduced it.

The discipline costs a little velocity up front and pays it back many times over. A feature that *could* be one 1,500-line PR becomes a backend PR, then a frontend PR, then a polish PR — and each one is boring to merge.

## Always-green main, verify before merge

The other half of the rule: `main` is always deployable, so nothing merges that hasn't been verified. Every PR clears the same gates — typecheck, tests, and a production build — but the interesting part is verifying the things those gates *can't* catch.

A typecheck won't tell you an Open Graph image looks right, or that a canvas share-card renders the winner's name, or that a blog post is actually visible instead of black-on-black. So for anything visual, the verification step is to **render it and look at it**: build the page, serve it, and screenshot it headless. More than once that caught a bug that every automated check had waved through — most memorably a blog post styled with utility classes for a framework the app doesn't use, which compiled perfectly and rendered invisibly.

For data, the same instinct applies with a different tool. Our problem bank is defined as a big static array, and early on a bad edit left a hole in it that silently truncated the whole seed. The fix wasn't just to patch the array — it was to add a script that *evaluates* the array on every change and asserts its length, uniqueness, and that there are no gaps. Now that class of bug fails loudly at build time instead of quietly in production.

The principle: **automated checks prove the code is valid; a human (or a script that thinks like one) proves it's correct.** Both have to pass before something is "done."

## Branch discipline

When you're merging small PRs continuously, branch hygiene stops being pedantry and becomes load-bearing. The rule we hold to: **the moment a PR merges, the next change starts from a fresh `main`.** Reset the working branch to the just-updated `main`, then build the next slice on top.

Skip this and you get the classic mess — a branch that still carries commits already merged upstream, a diff that shows changes that aren't really yours, and a PR reviewers can't trust. It's especially easy to trip on when two changes stack quickly: finish PR *A*, and if you start PR *B* without re-basing on the `main` that now contains *A*, *B*'s diff is polluted. Re-syncing after every merge keeps each PR showing exactly — and only — its own change.

Migrations get the same treatment. A merged migration is finished; new schema work restarts from the latest `main` rather than stacking on top of already-shipped history. Databases don't forgive a muddled migration order.

## What this buys you

None of this is novel. It's just applied consistently, and consistency is the whole point. Building a platform this way meant:

- **The product was usable the entire time.** There was never a "big rewrite in progress" branch. Every merge advanced a working system.
- **Incidents were small.** When something did break in production, it traced to one recent, understood change — not a fog of coupled work.
- **Momentum stayed high.** Small PRs merge fast, and fast merges feel good, and feeling good keeps you shipping. A 1,500-line PR that sits open for three days kills momentum; five 300-line PRs that each merge in an hour build it.

If there's one takeaway: **make "done" mean small, verified, and deployable — and enforce it on every single change.** The features take care of themselves after that. A platform is just a long series of small, boring merges, and the boring is a feature.
