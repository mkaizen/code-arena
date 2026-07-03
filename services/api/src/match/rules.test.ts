import { describe, it, expect } from "vitest";
import { winsToClinch, placementsByElimination, placementsByScore } from "./rules.js";

describe("winsToClinch", () => {
  it("is a majority of the rounds", () => {
    expect(winsToClinch(3)).toBe(2); // best of 3
    expect(winsToClinch(5)).toBe(3); // best of 5
    expect(winsToClinch(1)).toBe(1);
    expect(winsToClinch(6)).toBe(4);
  });
});

describe("placementsByElimination", () => {
  it("gives the winner 1st and ranks others by how late they went out", () => {
    const players = [
      { userId: "w", eliminatedRound: null },
      { userId: "a", eliminatedRound: 2 },
      { userId: "b", eliminatedRound: 0 },
      { userId: "c", eliminatedRound: 1 },
    ];
    const p = placementsByElimination(players, ["w"]);
    expect(p).toEqual({ w: 1, a: 2, c: 3, b: 4 });
  });

  it("shares a rank for same-round eliminations and skips accordingly", () => {
    const players = [
      { userId: "w", eliminatedRound: null },
      { userId: "a", eliminatedRound: 1 },
      { userId: "b", eliminatedRound: 1 },
      { userId: "c", eliminatedRound: 0 },
    ];
    const p = placementsByElimination(players, ["w"]);
    // a and b tie at 2nd; next place skips to 4th.
    expect(p).toEqual({ w: 1, a: 2, b: 2, c: 4 });
  });

  it("handles co-winners (a wipe leaving two standing)", () => {
    const players = [
      { userId: "x", eliminatedRound: null },
      { userId: "y", eliminatedRound: null },
      { userId: "z", eliminatedRound: 0 },
    ];
    const p = placementsByElimination(players, ["x", "y"]);
    expect(p).toEqual({ x: 1, y: 1, z: 3 });
  });
});

describe("placementsByScore", () => {
  it("ranks by round wins, most first", () => {
    const p = placementsByScore([
      { userId: "a", roundWins: 1 },
      { userId: "b", roundWins: 2 },
    ]);
    expect(p).toEqual({ b: 1, a: 2 });
  });

  it("equal scores are a shared 1st (draw)", () => {
    const p = placementsByScore([
      { userId: "a", roundWins: 1 },
      { userId: "b", roundWins: 1 },
    ]);
    expect(p).toEqual({ a: 1, b: 1 });
  });
});
