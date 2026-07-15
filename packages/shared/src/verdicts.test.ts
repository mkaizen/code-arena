import { describe, it, expect } from "vitest";
import { Verdict, verdictSummary, type JudgeResult } from "./verdicts.js";

function make(partial: Partial<JudgeResult>): JudgeResult {
  return { verdict: Verdict.AC, maxTimeMs: 0, maxMemoryKb: 0, cases: [], ...partial };
}

describe("verdictSummary", () => {
  it("accepted → all tests passed, no failing case", () => {
    expect(verdictSummary(make({ verdict: Verdict.AC, totalCases: 12 }))).toEqual({ passed: 12, total: 12, failedCase: null });
  });

  it("wrong answer → everything before the failing case passed", () => {
    expect(verdictSummary(make({ verdict: Verdict.WA, totalCases: 12, failedCase: 5 }))).toEqual({ passed: 4, total: 12, failedCase: 5 });
  });

  it("failing on the first test → 0 passed", () => {
    expect(verdictSummary(make({ verdict: Verdict.TLE, totalCases: 8, failedCase: 1 }))).toEqual({ passed: 0, total: 8, failedCase: 1 });
  });

  it("compilation error → nothing ran", () => {
    expect(verdictSummary(make({ verdict: Verdict.CE, totalCases: 10 }))).toEqual({ passed: 0, total: 10, failedCase: null });
  });

  it("internal error → nothing counted", () => {
    expect(verdictSummary(make({ verdict: Verdict.IE, totalCases: 10 }))).toEqual({ passed: 0, total: 10, failedCase: null });
  });

  it("falls back to cases length when totalCases is absent", () => {
    const cases = [1, 2, 3].map((i) => ({ index: i, verdict: Verdict.AC, timeMs: 0, memoryKb: 0 }));
    expect(verdictSummary({ verdict: Verdict.AC, failedCase: undefined, cases }).total).toBe(3);
  });
});
