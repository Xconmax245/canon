import { describe, expect, it } from "vitest";
import {
  plannedSceneLlmSchema,
  scenePlanLlmSchema,
  storyBibleLlmSchema,
} from "@/lib/llm/schemas";

describe("storyBibleLlmSchema", () => {
  const valid = {
    title: "The Storm",
    logline: "A captain races a storm home.",
    genre: "drama",
    tone: "tense",
    visualMotifs: ["rain", "lighthouse"],
    characters: [
      {
        id: "captain_eli",
        name: "Eli",
        canonicalDescription: "Weathered man in his 50s, grey beard, navy oilskin coat",
      },
    ],
    locations: [
      { id: "harbor", name: "Harbor", canonicalDescription: "Stone harbor with moored trawlers" },
    ],
    characterStates: [],
  };

  it("accepts a valid bible", () => {
    const r = storyBibleLlmSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects non-slug character ids", () => {
    const r = storyBibleLlmSchema.safeParse({
      ...valid,
      characters: [{ ...valid.characters[0], id: "Captain Eli!" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate character ids", () => {
    const c = valid.characters[0];
    const r = storyBibleLlmSchema.safeParse({ ...valid, characters: [c, { ...c }] });
    expect(r.success).toBe(false);
  });

  it("rejects short canonical descriptions", () => {
    const r = storyBibleLlmSchema.safeParse({
      ...valid,
      characters: [{ ...valid.characters[0], canonicalDescription: "tall" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("scenePlanLlmSchema", () => {
  const scene = (order: number) => ({
    order,
    scriptExcerpt: "He turns toward the storm.",
    characterIds: ["captain_eli"],
    action: "Eli turns the wheel hard to starboard.",
    composition: "close-up",
    continuityNotes: "rain continues",
  });

  it("accepts sequential orders", () => {
    const r = scenePlanLlmSchema.safeParse({ scenes: [scene(1), scene(2), scene(3)] });
    expect(r.success).toBe(true);
  });

  it("rejects non-sequential ordering", () => {
    const r = scenePlanLlmSchema.safeParse({ scenes: [scene(1), scene(3)] });
    expect(r.success).toBe(false);
  });

  it("rejects empty scene list", () => {
    expect(scenePlanLlmSchema.safeParse({ scenes: [] }).success).toBe(false);
  });

  it("rejects duplicate characterIds within a scene", () => {
    const s = { ...scene(1), characterIds: ["a", "a"] };
    expect(plannedSceneLlmSchema.safeParse(s).success).toBe(false);
  });
});
