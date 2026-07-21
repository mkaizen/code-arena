/**
 * The AI opponent for "Challenge the AI" duels.
 *
 * Unlike the simulated practice bots (`match/bots.ts`), which fabricate a
 * verdict from a rating curve and never run code, this opponent is handed the
 * same problem a human sees, writes a *real* program, and that program is
 * compiled and run in the same sandbox judge on the same hidden tests. Its
 * verdict is whatever the judge returns — nothing here is scripted.
 *
 * This module is the pure core — prompt building, response parsing, and the
 * effort profiles — with no config or network, so it is unit-tested directly.
 * The one impure seam (the model HTTP call) lives in `provider.ts`.
 */

import { LANGUAGES, type Language } from "@arena/shared";

/**
 * Every duel is a real race: the model plays at full effort, as fast as it is,
 * with no artificial handicap or head start. One profile for everyone.
 */
export const EFFORT = {
  /** Extra attempts after the first, spent iterating on a wrong/TLE verdict. */
  retryBudget: 4,
  /** Upper bound on the model's output tokens per attempt (caps worst-case cost). */
  maxTokens: 8000,
  /** Sampling temperature — low, for its steadiest play. */
  temperature: 0.2,
} as const;

/** The minimal problem view the model needs to solve a round. */
export interface AiProblem {
  id: string;
  slug: string;
  title: string;
  statement: string; // HTML
  samples: { input: string; output: string }[];
}

/** What the model produced: a judge-ready program in a supported language. */
export interface AiSolution {
  language: Language;
  source: string;
}

/** Feedback handed back to the model when its previous attempt was rejected. */
export interface AiFeedback {
  verdict: string;
  /** A sample the previous attempt got wrong, if known. */
  sample?: { input: string; expected: string };
}

// ── Pure helpers (unit-tested without a network) ────────────────────────────

/** Collapse problem-statement HTML to readable plain text for the prompt. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<sup\b[^>]*>/gi, "^")
    .replace(/<[^>]+>/g, "")
    .replace(/&le;/g, "<=")
    .replace(/&ge;/g, ">=")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&times;/g, "x")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Fenced code blocks: ```lang\n...code...``` */
const FENCE = /```([a-zA-Z0-9+#]*)\r?\n([\s\S]*?)```/g;

/** Map the many names a model uses for a language onto our judge's languages. */
const LANG_ALIASES: Record<string, Language> = {
  cpp: "cpp", "c++": "cpp", cxx: "cpp", cc: "cpp",
  py: "py", python: "py", python3: "py", py3: "py",
  java: "java",
  js: "js", javascript: "js", node: "js", nodejs: "js",
  go: "go", golang: "go",
  rs: "rs", rust: "rs",
};

/** Language the AI defaults to when a code block carries no usable tag. */
const DEFAULT_LANG: Language = "py";

/**
 * Pull a judge-ready program out of a model response. Prefers the *last* fenced
 * block whose tag names a supported language (models often explain, then give
 * the final program last); falls back to the last non-empty block in the
 * default language. Returns null if there's nothing runnable.
 */
export function extractSolution(text: string): AiSolution | null {
  const blocks = [...text.matchAll(FENCE)];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const lang = LANG_ALIASES[blocks[i][1].toLowerCase()];
    const source = blocks[i][2].replace(/\s+$/, "") + "\n";
    if (lang && source.trim()) return { language: lang, source };
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    const source = blocks[i][2].replace(/\s+$/, "") + "\n";
    if (source.trim()) return { language: DEFAULT_LANG, source };
  }
  return null;
}

/** System + user messages for one attempt. Pure — no network. */
export function buildMessages(
  problem: AiProblem,
  feedback?: AiFeedback,
): { system: string; user: string } {
  const langs = LANGUAGES.join(", ");
  const system =
    "You are an elite competitive programmer in a timed head-to-head coding duel. " +
    "Solve the problem correctly and quickly. Read all input from standard input and " +
    "write the answer to standard output, matching the required format exactly. " +
    `Reply with a single complete program in ONE of these languages: ${langs}. ` +
    "Put the program in one fenced code block tagged with its language (e.g. ```py), " +
    "and put nothing after that block.";

  const sampleText = problem.samples
    .map((s, i) => `Example ${i + 1}:\nInput:\n${s.input}\nExpected output:\n${s.output}`)
    .join("\n\n");

  let user =
    `Problem: ${problem.title}\n\n` +
    `${stripHtml(problem.statement)}\n\n` +
    (sampleText ? `${sampleText}\n\n` : "") +
    "Write the fastest correct solution you can.";

  if (feedback) {
    user +=
      `\n\nYour previous submission was judged ${feedback.verdict}.` +
      (feedback.sample
        ? ` It failed on this input:\n${feedback.sample.input}\nExpected:\n${feedback.sample.expected}`
        : "") +
      "\nFind the bug and return a corrected full program.";
  }

  return { system, user };
}
