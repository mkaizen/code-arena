import { describe, it, expect } from "vitest";
import { parseAiModels } from "./models.js";

const BASE = {
  AI_OPPONENT_NAME: "House",
  AI_API_URL: "https://house/api",
  AI_API_VERSION: "2023-06-01",
};

describe("parseAiModels", () => {
  it("returns nothing when no model is configured", () => {
    expect(parseAiModels({ ...BASE })).toEqual([]);
  });

  it("builds the house model from the single-model vars", () => {
    const models = parseAiModels({ ...BASE, AI_API_KEY: "k1", AI_OPPONENT_MODEL: "m1" });
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ key: "m1", name: "House", model: "m1", apiKey: "k1", apiUrl: "https://house/api" });
  });

  it("appends AI_MODELS entries after the house model, filling defaults", () => {
    const models = parseAiModels({
      ...BASE,
      AI_API_KEY: "k1",
      AI_OPPONENT_MODEL: "m1",
      AI_MODELS: JSON.stringify([{ name: "Rival", model: "m2", apiKey: "k2", apiUrl: "https://rival/api" }]),
    });
    expect(models.map((m) => m.key)).toEqual(["m1", "m2"]);
    expect(models[1]).toMatchObject({ name: "Rival", model: "m2", apiKey: "k2", apiUrl: "https://rival/api" });
    // inherits the default api version when omitted
    expect(models[1].apiVersion).toBe("2023-06-01");
  });

  it("drops duplicate wire ids (first wins)", () => {
    const models = parseAiModels({
      ...BASE,
      AI_API_KEY: "k1",
      AI_OPPONENT_MODEL: "m1",
      AI_MODELS: JSON.stringify([{ name: "Dup", model: "m1", apiKey: "kX" }]),
    });
    expect(models).toHaveLength(1);
    expect(models[0].apiKey).toBe("k1");
  });

  it("skips malformed entries and never throws on bad JSON", () => {
    const models = parseAiModels({
      ...BASE,
      AI_API_KEY: "k1",
      AI_OPPONENT_MODEL: "m1",
      AI_MODELS: "{not json",
    });
    expect(models.map((m) => m.key)).toEqual(["m1"]);

    const models2 = parseAiModels({
      ...BASE,
      AI_MODELS: JSON.stringify([{ name: "NoKey" }, { model: "m3", apiKey: "k3" }, 42, null]),
    });
    // only the well-formed entry survives
    expect(models2.map((m) => m.key)).toEqual(["m3"]);
  });

  it("names a model by its wire id when no display name is given", () => {
    const models = parseAiModels({ ...BASE, AI_MODELS: JSON.stringify([{ model: "m9", apiKey: "k9" }]) });
    expect(models[0].name).toBe("m9");
  });
});
