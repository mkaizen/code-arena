import { describe, it, expect } from "vitest";
import { LANGUAGES } from "@arena/shared";
import {
  extractSolution,
  buildMessages,
  stripHtml,
  EFFORT,
  type AiProblem,
} from "./opponent.js";

const PROBLEM: AiProblem = {
  id: "p1",
  slug: "sum-of-two",
  title: "Sum of Two",
  statement:
    "<p>Read two integers <code>a</code> and <code>b</code>. Print their sum.</p>" +
    "<p><strong>Constraints:</strong> -10<sup>9</sup> &le; a, b &le; 10<sup>9</sup></p>",
  samples: [{ input: "2 3\n", output: "5\n" }],
};

describe("extractSolution", () => {
  it("pulls the fenced program and maps the language tag", () => {
    const sol = extractSolution("Here you go:\n```py\nprint(sum(map(int, input().split())))\n```");
    expect(sol).not.toBeNull();
    expect(sol!.language).toBe("py");
    expect(sol!.source).toContain("print(");
    expect(sol!.source.endsWith("\n")).toBe(true);
  });

  it("maps every alias the model might use to a supported language", () => {
    for (const [tag, lang] of [
      ["python3", "py"],
      ["c++", "cpp"],
      ["golang", "go"],
      ["rust", "rs"],
      ["javascript", "js"],
      ["java", "java"],
    ] as const) {
      const sol = extractSolution("```" + tag + "\ncode here\n```");
      expect(sol!.language, `${tag} -> ${lang}`).toBe(lang);
      expect(LANGUAGES).toContain(sol!.language);
    }
  });

  it("prefers the LAST language-tagged block (models explain, then give the final program)", () => {
    const text = "First attempt:\n```py\nWRONG\n```\nActually, the final answer:\n```py\nRIGHT\n```";
    expect(extractSolution(text)!.source.trim()).toBe("RIGHT");
  });

  it("falls back to the default language for an untagged block", () => {
    const sol = extractSolution("```\nprint(42)\n```");
    expect(sol!.language).toBe("py");
    expect(sol!.source.trim()).toBe("print(42)");
  });

  it("returns null when there is no runnable code", () => {
    expect(extractSolution("I cannot solve this problem.")).toBeNull();
    expect(extractSolution("```py\n\n```")).toBeNull();
  });
});

describe("stripHtml", () => {
  it("renders entities and tags to readable plain text", () => {
    const out = stripHtml(PROBLEM.statement);
    expect(out).toContain("Read two integers a and b");
    expect(out).toContain("<="); // &le;
    expect(out).toContain("10^9"); // sup
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("&le;");
  });
});

describe("buildMessages", () => {
  it("includes the statement, samples, and the allowed languages", () => {
    const { system, user } = buildMessages(PROBLEM);
    for (const lang of LANGUAGES) expect(system).toContain(lang);
    expect(user).toContain("Sum of Two");
    expect(user).toContain("Print their sum");
    expect(user).toContain("2 3"); // sample input
    expect(user).toContain("5"); // sample output
  });

  it("appends the failing sample as feedback on a retry", () => {
    const { user } = buildMessages(PROBLEM, {
      verdict: "WRONG_ANSWER",
      sample: { input: "9 9\n", expected: "18\n" },
    });
    expect(user).toContain("WRONG_ANSWER");
    expect(user).toContain("9 9");
    expect(user).toContain("18");
  });
});

describe("EFFORT profile (a real race — full effort, no handicap)", () => {
  it("allows iteration and keeps sampling steady", () => {
    expect(EFFORT.retryBudget).toBeGreaterThan(0);
    expect(EFFORT.maxTokens).toBeGreaterThan(0);
    expect(EFFORT.temperature).toBeLessThanOrEqual(0.5);
  });
});
