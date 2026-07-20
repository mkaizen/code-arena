import { describe, it, expect } from "vitest";
import { winsToClinch, placementsByElimination, placementsByScore, humanRatingRanks, placementRanks, aiVsAiRoundWinner } from "./rules.js";

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

describe("humanRatingRanks", () => {
  it("is unchanged for an all-human field", () => {
    const ranks = humanRatingRanks([
      { userId: "a", isBot: false, placement: 1 },
      { userId: "b", isBot: false, placement: 2 },
      { userId: "c", isBot: false, placement: 3 },
    ]);
    expect(ranks).toEqual([
      { userId: "a", rank: 1 },
      { userId: "b", rank: 2 },
      { userId: "c", rank: 3 },
    ]);
  });

  it("drops bots and re-ranks the humans contiguously", () => {
    // A backfilled royale: human placed 1st and 4th, bots took 2nd/3rd/5th/6th.
    const ranks = humanRatingRanks([
      { userId: "h1", isBot: false, placement: 1 },
      { userId: "bot1", isBot: true, placement: 2 },
      { userId: "bot2", isBot: true, placement: 3 },
      { userId: "h2", isBot: false, placement: 4 },
      { userId: "bot3", isBot: true, placement: 5 },
    ]);
    expect(ranks).toEqual([
      { userId: "h1", rank: 1 },
      { userId: "h2", rank: 2 },
    ]);
  });

  it("preserves ties among humans (competition ranking)", () => {
    const ranks = humanRatingRanks([
      { userId: "h1", isBot: false, placement: 1 },
      { userId: "h2", isBot: false, placement: 1 },
      { userId: "bot", isBot: true, placement: 3 },
      { userId: "h3", isBot: false, placement: 4 },
    ]);
    expect(ranks).toEqual([
      { userId: "h1", rank: 1 },
      { userId: "h2", rank: 1 },
      { userId: "h3", rank: 3 },
    ]);
  });

  it("returns a lone human (caller leaves them unrated)", () => {
    const ranks = humanRatingRanks([
      { userId: "solo", isBot: false, placement: 1 },
      { userId: "bot1", isBot: true, placement: 2 },
    ]);
    expect(ranks).toEqual([{ userId: "solo", rank: 1 }]);
  });

  it("ignores players with no placement", () => {
    const ranks = humanRatingRanks([
      { userId: "a", isBot: false, placement: 1 },
      { userId: "b", isBot: false, placement: null },
    ]);
    expect(ranks).toEqual([{ userId: "a", rank: 1 }]);
  });
});

describe("placementRanks (AI-vs-AI Elo)", () => {
  it("ranks a decisive exhibition — winner 1, loser 2 (bots included)", () => {
    expect(
      placementRanks([
        { userId: "modelA", placement: 1 },
        { userId: "modelB", placement: 2 },
      ]),
    ).toEqual([
      { userId: "modelA", rank: 1 },
      { userId: "modelB", rank: 2 },
    ]);
  });

  it("shares the lower rank on a draw, so recomputeRatings washes it", () => {
    expect(
      placementRanks([
        { userId: "modelA", placement: 1 },
        { userId: "modelB", placement: 1 },
      ]),
    ).toEqual([
      { userId: "modelA", rank: 1 },
      { userId: "modelB", rank: 1 },
    ]);
  });

  it("drops unplaced players", () => {
    expect(
      placementRanks([
        { userId: "modelA", placement: 1 },
        { userId: "modelB", placement: null },
      ]),
    ).toEqual([{ userId: "modelA", rank: 1 }]);
  });
});

describe("aiVsAiRoundWinner (correctness, not speed)", () => {
  it("awards the round to the sole solver", () => {
    expect(aiVsAiRoundWinner(["gpt5"])).toBe("gpt5");
  });
  it("is a draw when both models solve", () => {
    expect(aiVsAiRoundWinner(["gpt5", "gpt3"])).toBeNull();
  });
  it("is a draw when neither solves", () => {
    expect(aiVsAiRoundWinner([])).toBeNull();
  });
});
