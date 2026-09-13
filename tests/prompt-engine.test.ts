import { describe, expect, it } from "vitest";
import { computeIdentityLock } from "@/lib/types";
import { selectModel } from "@/lib/prompt-engine/router";
import {
  buildFlux2MultiPrompt,
  buildIdeogramCharacterPrompt,
  buildTextToImagePrompt,
} from "@/lib/prompt-engine/lanes";
import { buildIdentityBlock } from "@/lib/prompt-engine";
import type { StoryBibleLlm } from "@/lib/llm/schemas";

describe("computeIdentityLock", () => {
  it("returns none for 0 characters", () => {
    expect(computeIdentityLock(0)).toBe("none");
  });
  it("returns single for 1 character", () => {
    expect(computeIdentityLock(1)).toBe("single");
  });
  it("returns multi for 2+ characters", () => {
    expect(computeIdentityLock(2)).toBe("multi");
    expect(computeIdentityLock(5)).toBe("multi");
  });
});

describe("selectModel (three-lane router)", () => {
  it("routes none → text-to-image", () => {
    expect(selectModel("none")).toBe("text-to-image");
  });
  it("routes single → ideogram-character", () => {
    expect(selectModel("single")).toBe("ideogram-character");
  });
  it("routes multi → flux2-multi", () => {
    expect(selectModel("multi")).toBe("flux2-multi");
  });
});

describe("lane builders", () => {
  const base = {
    styleDirective: "cinematic, moody lighting",
    aspectRatio: "16:9",
    identityBlock: "A woman in her 30s with short black hair",
    narrative: "She sprints across the rooftop at dusk.",
    model: "test-model",
  };

  it("text-to-image: no identity prefix", () => {
    const out = buildTextToImagePrompt(base);
    expect(out.prompt).toContain("She sprints");
    expect(out.prompt).toContain("Style: cinematic");
    expect(out.prompt).not.toContain("referenced character");
    expect(out.negativePrompt).toContain("watermark");
  });

  it("ideogram-character: identity-locked prefix and stronger negatives", () => {
    const out = buildIdeogramCharacterPrompt(base);
    expect(out.prompt).toContain("referenced character");
    expect(out.prompt).toContain("unchanged facial identity");
    expect(out.negativePrompt).toContain("altered face");
  });

  it("flux2-multi: mentions reference count when refs exist", () => {
    const out = buildFlux2MultiPrompt({ ...base, referenceCount: 3 });
    expect(out.prompt).toContain("3 reference images");
  });

  it("flux2-multi: no reference mention when zero refs", () => {
    const out = buildFlux2MultiPrompt({ ...base, referenceCount: 0 });
    expect(out.prompt).not.toContain("reference images");
  });

  it("all builders keep the model id", () => {
    expect(buildTextToImagePrompt(base).model).toBe("test-model");
    expect(buildIdeogramCharacterPrompt(base).model).toBe("test-model");
  });
});

describe("buildIdentityBlock", () => {
  const bible: StoryBibleLlm = {
    title: "Test",
    logline: "",
    genre: "",
    tone: "",
    visualMotifs: [],
    characters: [
      {
        id: "maya",
        name: "Maya",
        canonicalDescription: "Woman in her 30s, short black hair, silver jacket",
        referenceImageUrls: [],
      },
    ],
    locations: [
      {
        id: "rooftop",
        name: "Rooftop",
        canonicalDescription: "Rain-slick city rooftop at night",
        referenceImageUrls: [],
      },
    ],
    characterStates: [
      {
        characterId: "maya",
        sceneRef: "2",
        changes: "torn sleeve, cut above left eyebrow",
      },
    ],
  };

  it("includes canonical description, state for the right scene, and location", () => {
    const block = buildIdentityBlock(
      {
        order: 2,
        scriptExcerpt: "x",
        characterIds: ["maya"],
        locationId: "rooftop",
        action: "runs",
        composition: "wide shot",
        continuityNotes: "",
      },
      bible,
    );
    expect(block).toContain("short black hair");
    expect(block).toContain("torn sleeve, cut above left eyebrow");
    expect(block).toContain("Rain-slick city rooftop");
    expect(block).toContain("wide shot");
  });

  it("does not apply a state from a different scene", () => {
    const block = buildIdentityBlock(
      {
        order: 1,
        scriptExcerpt: "x",
        characterIds: ["maya"],
        action: "stands",
        composition: "",
        continuityNotes: "",
      },
      bible,
    );
    expect(block).not.toContain("torn sleeve");
  });
});
