import { describe, it, expect } from "vitest";
import { snapshotData, restoreData, parseSamples, type VersionableProblem, type StoredVersion } from "./versioning.js";

const problem: VersionableProblem = {
  version: 3,
  title: "Two Sum",
  statement: "<p>Find two numbers…</p>",
  editorial: "<p>Use a hash map.</p>",
  difficulty: "easy",
  ratingValue: 1200,
  tags: ["arrays", "hashing"],
  timeMs: 2000,
  memoryKb: 262144,
  testCount: 25,
  samples: [{ input: "1 2", output: "3" }],
};

describe("snapshotData", () => {
  it("captures every versioned field plus the editor and version number", () => {
    const snap = snapshotData(problem, "alice");
    expect(snap).toEqual({
      version: 3,
      title: "Two Sum",
      statement: "<p>Find two numbers…</p>",
      editorial: "<p>Use a hash map.</p>",
      difficulty: "easy",
      ratingValue: 1200,
      tags: ["arrays", "hashing"],
      timeMs: 2000,
      memoryKb: 262144,
      samples: [{ input: "1 2", output: "3" }],
      testCount: 25,
      editorHandle: "alice",
    });
  });

  it("allows a null editor (system/unknown)", () => {
    expect(snapshotData(problem, null).editorHandle).toBeNull();
  });
});

describe("restoreData", () => {
  const stored: StoredVersion = { ...problem, editorHandle: "bob", createdAt: "" } as unknown as StoredVersion;

  it("restores the definition fields", () => {
    expect(restoreData(stored)).toEqual({
      title: "Two Sum",
      statement: "<p>Find two numbers…</p>",
      editorial: "<p>Use a hash map.</p>",
      difficulty: "easy",
      ratingValue: 1200,
      tags: ["arrays", "hashing"],
      timeMs: 2000,
      memoryKb: 262144,
    });
  });

  it("never touches testCount or version — hidden tests aren't restorable", () => {
    const rd = restoreData(stored) as Record<string, unknown>;
    expect(rd).not.toHaveProperty("testCount");
    expect(rd).not.toHaveProperty("version");
    expect(rd).not.toHaveProperty("samples"); // recreated separately by the route
  });
});

describe("parseSamples", () => {
  it("normalizes well-formed JSON samples", () => {
    expect(parseSamples([{ input: "a", output: "b" }])).toEqual([{ input: "a", output: "b" }]);
  });

  it("coerces missing fields to empty strings", () => {
    expect(parseSamples([{ input: "a" }, {}])).toEqual([
      { input: "a", output: "" },
      { input: "", output: "" },
    ]);
  });

  it("returns [] for non-array or junk input", () => {
    expect(parseSamples(null)).toEqual([]);
    expect(parseSamples("nope")).toEqual([]);
    expect(parseSamples([null, 5])).toEqual([]);
  });
});
