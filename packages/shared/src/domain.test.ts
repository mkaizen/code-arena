import { describe, it, expect } from "vitest";
import { sanitizeReaction, MATCH_REACTIONS } from "./domain.js";

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
