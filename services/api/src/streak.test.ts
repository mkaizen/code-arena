import { describe, it, expect } from "vitest";
import { nextStreak, streakAlive, utcDate } from "./streak.js";

const day = (iso: string) => utcDate(new Date(`${iso}T12:00:00Z`));

describe("nextStreak", () => {
  it("starts a streak at 1 for a first-ever solve", () => {
    expect(nextStreak(null, 0, 0, day("2026-07-06"))).toEqual({ current: 1, longest: 1 });
  });

  it("extends when the previous solve was the day before", () => {
    expect(nextStreak(day("2026-07-05"), 4, 4, day("2026-07-06"))).toEqual({ current: 5, longest: 5 });
  });

  it("resets to 1 after a gap of more than one day", () => {
    expect(nextStreak(day("2026-07-03"), 9, 9, day("2026-07-06"))).toEqual({ current: 1, longest: 9 });
  });

  it("keeps the longest streak when the current one resets", () => {
    expect(nextStreak(day("2026-06-01"), 12, 30, day("2026-07-06"))).toEqual({ current: 1, longest: 30 });
  });

  it("raises the longest streak once the current one passes it", () => {
    expect(nextStreak(day("2026-07-05"), 7, 7, day("2026-07-06"))).toEqual({ current: 8, longest: 8 });
  });
});

describe("streakAlive", () => {
  const today = day("2026-07-06");

  it("is false with no prior solve", () => {
    expect(streakAlive(null, today)).toBe(false);
  });

  it("is alive when the last solve was today", () => {
    expect(streakAlive(day("2026-07-06"), today)).toBe(true);
  });

  it("is alive when the last solve was yesterday (still savable)", () => {
    expect(streakAlive(day("2026-07-05"), today)).toBe(true);
  });

  it("has lapsed when the last solve was two days ago", () => {
    expect(streakAlive(day("2026-07-04"), today)).toBe(false);
  });
});

describe("utcDate", () => {
  it("normalizes any instant to UTC midnight of its calendar day", () => {
    expect(utcDate(new Date("2026-07-06T23:59:59Z")).toISOString()).toBe("2026-07-06T00:00:00.000Z");
    expect(utcDate(new Date("2026-07-06T00:00:00Z")).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
