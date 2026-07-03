import { describe, it, expect } from "vitest";
import { normalize } from "./normalize.js";

describe("normalize", () => {
  it("treats CRLF and LF as equal", () => {
    expect(normalize("a\r\nb")).toBe(normalize("a\nb"));
  });

  it("strips trailing whitespace on each line", () => {
    expect(normalize("hello   \nworld\t")).toBe("hello\nworld");
  });

  it("trims trailing blank lines", () => {
    expect(normalize("42\n\n\n")).toBe("42");
  });

  it("accepts a missing vs present final newline as equal", () => {
    expect(normalize("5\n")).toBe(normalize("5"));
  });

  it("preserves internal blank lines and leading whitespace", () => {
    expect(normalize("a\n\nb")).toBe("a\n\nb");
    expect(normalize("  indented")).toBe("  indented");
  });

  it("does not equate different content", () => {
    expect(normalize("1 2 3")).not.toBe(normalize("1 2 4"));
  });

  it("handles empty output", () => {
    expect(normalize("")).toBe("");
    expect(normalize("\n\n")).toBe("");
  });
});
