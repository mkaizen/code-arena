import { describe, it, expect } from "vitest";
import { tokenize, fingerprint, similarity } from "./fingerprint.js";

describe("tokenize", () => {
  it("erases comments and normalizes identifiers, keeping keywords + structure", () => {
    const a = tokenize("int add(int a, int b) { return a + b; } // sums");
    const b = tokenize("int add(int xxx, int yyy) { return xxx + yyy; }");
    // Renaming a/b -> xxx/yyy must not change the token stream at all.
    expect(a).toEqual(b);
    // Keywords survive, identifiers collapse to W, punctuation kept.
    expect(a).toContain("int");
    expect(a).toContain("return");
    expect(a).toContain("W");
    expect(a).not.toContain("add");
  });

  it("collapses string and char literals to a single sentinel", () => {
    expect(tokenize('print("hello world")')).toEqual(tokenize('print("goodbye")'));
    expect(tokenize('x = "a"')).toContain("S");
  });

  it("collapses numbers regardless of value", () => {
    expect(tokenize("x = 12345")).toEqual(tokenize("x = 7"));
  });
});

describe("similarity via fingerprints", () => {
  const solution = `
    def solve():
        n = int(input())
        total = 0
        for i in range(n):
            total += i * i
        print(total)
  `;

  it("scores an identical submission at 1.0", () => {
    const fp = fingerprint(solution);
    expect(similarity(fp, fingerprint(solution)).score).toBe(1);
  });

  it("stays high when only variable names and formatting change", () => {
    const renamed = `
      def solve():
          count=int(input())
          acc=0
          for idx in range(count):
              acc+=idx*idx
          print(acc)
    `;
    const score = similarity(fingerprint(solution), fingerprint(renamed)).score;
    expect(score).toBeGreaterThan(0.8);
  });

  it("scores structurally unrelated code low", () => {
    const other = `
      import sys
      def main():
          data = sys.stdin.read().split()
          words = {}
          for w in data:
              words[w] = words.get(w, 0) + 1
          for k in sorted(words):
              print(k, words[k])
      main()
    `;
    const score = similarity(fingerprint(solution), fingerprint(other)).score;
    expect(score).toBeLessThan(0.5);
  });

  it("reports 0 for an empty fingerprint set", () => {
    expect(similarity(new Set(), fingerprint(solution))).toEqual({ score: 0, shared: 0 });
  });
});
