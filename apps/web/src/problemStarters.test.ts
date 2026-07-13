import { describe, it, expect } from "vitest";
import type { Language } from "@arena/shared";
import { LANGUAGES } from "@arena/shared";
import { starterFor, _internal } from "./problemStarters.js";
import { STARTERS } from "./starters.js";

const { SPECS, generate } = _internal;
const slugs = Object.keys(SPECS);

describe("per-problem starters", () => {
  it("has a spec for the flagship problems", () => {
    for (const s of ["even-or-odd", "sum-of-two", "knapsack", "matrix-transpose", "coin-change"]) {
      expect(SPECS[s], `missing spec for ${s}`).toBeTruthy();
    }
    // The bank is ~127 problems; guard against accidental spec loss.
    expect(slugs.length).toBeGreaterThan(120);
  });

  it("generates a non-empty, placeholder-free starter for every spec and language", () => {
    for (const slug of slugs) {
      for (const lang of LANGUAGES) {
        const code = starterFor(slug, lang);
        expect(code.length, `${slug}/${lang} empty`).toBeGreaterThan(0);
        expect(code, `${slug}/${lang} leaked undefined`).not.toContain("undefined");
        expect(code, `${slug}/${lang} missing TODO`).toMatch(/TODO/);
      }
    }
  });

  it("tailors even-or-odd to read n in each language", () => {
    // The whole point: the statement says 'read an integer n', so the starter
    // should actually declare n — not the generic 'data' token scaffold.
    expect(starterFor("even-or-odd", "py")).toContain("n = int(sys.stdin.readline())");
    expect(starterFor("even-or-odd", "cpp")).toContain("long long n;");
    expect(starterFor("even-or-odd", "java")).toContain("long n = Long.parseLong");
    expect(starterFor("even-or-odd", "js")).toContain("const n = Number");
    expect(starterFor("even-or-odd", "go")).toContain("strconv.ParseInt");
    expect(starterFor("even-or-odd", "rs")).toContain("let n: i64");
    for (const lang of LANGUAGES) {
      expect(starterFor("even-or-odd", lang)).not.toContain("Parse the tokens");
    }
  });

  it("names the declared inputs from the statement", () => {
    const py = starterFor("sum-of-two", "py");
    expect(py).toContain("a, b = map(int, sys.stdin.readline().split())");
    expect(starterFor("knapsack", "py")).toContain("weights = list(map(int, sys.stdin.readline().split()))");
    expect(starterFor("matrix-transpose", "py")).toContain("for _ in range(r):");
  });

  it("only imports strconv in Go when the input has numbers", () => {
    // reverse-string reads a single string — no numeric parsing needed.
    const goStr = starterFor("reverse-string", "go");
    expect(goStr).not.toContain("strconv");
    // even-or-odd parses an int.
    expect(starterFor("even-or-odd", "go")).toContain('"strconv"');
  });

  it("discards every read variable in Go so a fresh submission still compiles", () => {
    // Go treats unused locals as a compile error; the generator must discard them.
    expect(starterFor("knapsack", "go")).toContain("_ = weights");
    expect(starterFor("even-or-odd", "go")).toContain("_ = n");
  });

  it("falls back to the generic template for an unknown slug", () => {
    for (const lang of LANGUAGES as Language[]) {
      expect(starterFor("no-such-problem", lang)).toBe(STARTERS[lang]);
    }
  });

  it("is a pure function of (spec, lang)", () => {
    for (const slug of slugs.slice(0, 5)) {
      for (const lang of LANGUAGES) {
        expect(generate(SPECS[slug], lang)).toBe(generate(SPECS[slug], lang));
      }
    }
  });
});
