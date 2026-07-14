/**
 * Blog post registry — the single source of truth for the post list, shared by
 * the web blog index (`apps/web/src/pages/BlogPage.tsx`) and the API sitemap
 * (`services/api/src/routes/seo.ts`) so the two can never drift. Each post's
 * markdown body lives in `apps/web/public/content/blog/<slug>.md`.
 *
 * Add new posts here (newest first) and drop the matching markdown file.
 */
export interface BlogPost {
  slug: string;
  title: string;
  /** ISO date (YYYY-MM-DD); also used as the sitemap <lastmod>. */
  date: string;
  author: string;
  description: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "making-a-desktop-coding-arena-work-on-phones",
    title: "Making a Desktop Coding Arena Work on Phones",
    date: "2026-07-14",
    author: "Matthew",
    description:
      "Code Arena was built desktop-first — two-pane solve screens and a wide nav bar that fell apart on a phone. Retrofitting it for mobile with one small media-query hook, a tabbed layout, a hamburger menu, and a screenshot-driven way to actually verify it.",
  },
  {
    slug: "polishing-game-feel-in-a-coding-arena",
    title: "Polishing Game Feel in a Coding Arena",
    date: "2026-07-11",
    author: "Matthew",
    description:
      "The small, no-new-logic changes that make a real-time coding match feel good to play: editor keyboard shortcuts (and the stale-closure trap they hide), a verdict flash, an auto-scrolling console, and telling the player why a button is disabled.",
  },
  {
    slug: "sizing-a-100-player-battle-royale",
    title: "Sizing a 100-Player Battle Royale: Scale the Judge, Not the Sockets",
    date: "2026-07-08",
    author: "Matthew",
    description:
      "Scaling a real-time coding Battle Royale from 6 players to 100 isn't a networking problem — it's a judging problem. Working from the real sandbox limits (2s, 256MB, one core per container) to judge-seconds per submission, round-1 load, and a concrete server spec.",
  },
  {
    slug: "catching-copied-code-with-winnowing",
    title: "Catching Copied Code: Structural Plagiarism Detection with Winnowing",
    date: "2026-07-04",
    author: "Matthew",
    description:
      "How Code Arena flags copied contest submissions with a MOSS-style pipeline — tokenizing away formatting and variable names, hashing k-grams, winnowing to a compact fingerprint, and scoring with containment so padding can't hide a copy.",
  },
  {
    slug: "fanning-out-websockets-across-a-cluster",
    title: "One Emit, Every Node: Fanning Out WebSockets Across a Cluster",
    date: "2026-06-30",
    author: "Matthew",
    description:
      "Scaling the real-time layer past a single API process — routing every WebSocket event through a Redis bus so a socket on one node receives an event emitted on another, and a SET NX claim that makes judge side-effects fire exactly once cluster-wide.",
  },
  {
    slug: "the-dependency-diet",
    title: "The Dependency Diet: Building Features Without the Bloat",
    date: "2026-06-27",
    author: "Matthew",
    description:
      "Reach for a new npm package last, not first. Real examples from Code Arena — canvas share cards, email over fetch, kernel memory accounting, no CSS framework — and the rule of thumb for when to add a dependency anyway.",
  },
  {
    slug: "shipping-one-small-pr-at-a-time",
    title: "Shipping a Platform One Small PR at a Time",
    date: "2026-06-23",
    author: "Matthew",
    description:
      "The development workflow behind Code Arena: small single-purpose pull requests, an always-deployable main, verify-before-merge, and strict branch discipline.",
  },
  {
    slug: "generating-prisma-migrations-offline",
    title: "Generating Prisma Migrations Offline, Without a Database",
    date: "2026-06-20",
    author: "Matthew",
    description:
      "Generate migration SQL with no database using migrate diff and --from-schema-datamodel — why it beats --from-migrations, and a subtle gotcha that can silently corrupt a migration and break production.",
  },
  {
    slug: "measuring-peak-memory-with-cgroups",
    title: "Measuring a Program's True Peak Memory with cgroups",
    date: "2026-06-16",
    author: "Matthew",
    description:
      "Get a program's exact peak memory — not an estimate — by reading the kernel's own cgroup high-water mark (memory.peak), with cgroup v1 fallbacks, from inside a Docker sandbox.",
  },
  {
    slug: "designing-a-fair-elo-system",
    title: "Designing a Fair Elo System for Coding Contests",
    date: "2026-06-13",
    author: "Matthew",
    description:
      "Classic Elo is built for two players. How Code Arena generalizes it to rate N-player contests and real-time matches fairly — expected rank, geometric-mean targeting, damping, and a zero-sum correction.",
  },
  {
    slug: "scaling-the-arena",
    title: "Building Code Arena: Scaling WebSockets & Docker Sandboxes",
    date: "2026-06-09",
    author: "Matthew",
    description:
      "A deep dive into the architecture: BullMQ submission queues, a hardened Docker + cgroups sandbox, Redis pub/sub verdict streaming over per-user WebSockets, and the real-time Battle Royale round engine.",
  },
];
