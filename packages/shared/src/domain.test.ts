import { describe, it, expect } from "vitest";
import { sanitizeReaction, MATCH_REACTIONS, relatedProblems, extractComplexity, tagLabel } from "./domain.js";

describe("sanitizeReaction", () => {
  it("accepts every sanctioned emote and returns it unchanged", () => {
    for (const emoji of MATCH_REACTIONS) {
      expect(sanitizeReaction(emoji)).toBe(emoji);
    }
  });

  it("rejects emoji outside the allowlist", () => {
    expect(sanitizeReaction("💩")).toBeNull();
    expect(sanitizeReaction("🚀")).toBeNull();
  });

  it("rejects non-emoji strings and non-strings", () => {
    expect(sanitizeReaction("")).toBeNull();
    expect(sanitizeReaction("nice try")).toBeNull();
    expect(sanitizeReaction("👍👍")).toBeNull();
    expect(sanitizeReaction(42)).toBeNull();
    expect(sanitizeReaction(null)).toBeNull();
    expect(sanitizeReaction(undefined)).toBeNull();
    expect(sanitizeReaction({ emoji: "👍" })).toBeNull();
  });
});

describe("relatedProblems", () => {
  const p = (slug: string, ratingValue: number, tags: string[]) => ({ slug, title: slug, ratingValue, tags });
  const bank = [
    p("two-sum", 1000, ["arrays", "hashing"]),
    p("three-sum", 1400, ["arrays", "two-pointers"]),
    p("group-anagrams", 1300, ["strings", "hashing"]),
    p("lru-cache", 1700, ["hashing", "design"]),
    p("fib", 900, ["dp"]),
  ];

  it("ranks by shared-tag overlap, most shared first", () => {
    const target = p("contains-duplicate", 1100, ["arrays", "hashing"]);
    const out = relatedProblems(target, bank).map((r) => r.slug);
    // two-sum shares 2 tags; three-sum/group-anagrams/lru-cache share 1; fib shares 0.
    expect(out[0]).toBe("two-sum");
    expect(out).not.toContain("fib");
  });

  it("breaks ties by closeness in rating", () => {
    const target = p("x", 1350, ["hashing"]); // shares 1 tag with several
    const out = relatedProblems(target, bank).map((r) => r.slug);
    // group-anagrams(1300) is closest in rating to 1350, then two-sum(1000)/lru-cache(1700).
    expect(out[0]).toBe("group-anagrams");
  });

  it("excludes the target itself and untagged matches, and respects the limit", () => {
    const target = p("two-sum", 1000, ["arrays", "hashing"]);
    const out = relatedProblems(target, bank, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.slug)).not.toContain("two-sum");
  });

  it("returns nothing when no tags are shared", () => {
    expect(relatedProblems(p("solo", 1000, ["graphs"]), bank)).toEqual([]);
  });
});

describe("extractComplexity", () => {
  it("pulls Time and Space out of an editorial", () => {
    const ed = "<p>We hash as we go. Time: O(n) single pass. Space: O(n) for the map.</p>";
    expect(extractComplexity(ed)).toEqual({ time: "O(n) single pass", space: "O(n) for the map" });
  });
  it("returns null when neither is present", () => {
    expect(extractComplexity("<p>Just sort it.</p>")).toBeNull();
  });
});

describe("tagLabel", () => {
  it("expands known overrides and title-cases the rest", () => {
    expect(tagLabel("dp")).toBe("Dynamic Programming");
    expect(tagLabel("two-pointers")).toBe("Two Pointers");
    expect(tagLabel("math")).toBe("Math");
  });
});
