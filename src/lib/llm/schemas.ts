import { z } from "zod";

// ---------------------------------------------------------------------------
// Stage 1: analyzeStory → StoryBible
// ---------------------------------------------------------------------------

export const llmCharacterSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "id must be a lowercase slug (letters, digits, -, _)"),
  name: z.string().min(1),
  canonicalDescription: z.string().min(10),
  referenceImageUrls: z.array(z.string()).default([]),
});

export const llmLocationSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "id must be a lowercase slug (letters, digits, -, _)"),
  name: z.string().min(1),
  canonicalDescription: z.string().min(10),
  referenceImageUrls: z.array(z.string()).default([]),
});

export const llmCharacterStateSchema = z.object({
  characterId: z.string().min(1),
  sceneRef: z.string().min(1).describe("The scene 'id' the state change belongs to"),
  changes: z.string().default(""),
});

export const storyBibleLlmSchema = z
  .object({
    title: z.string().default("Untitled"),
    logline: z.string().default(""),
    genre: z.string().default(""),
    tone: z.string().default(""),
    visualMotifs: z.array(z.string()).default([]),
    characters: z.array(llmCharacterSchema).min(0),
    locations: z.array(llmLocationSchema).min(0),
    characterStates: z.array(llmCharacterStateSchema).default([]),
  })
  .superRefine((bible, ctx) => {
    const ids = new Set<string>();
    for (const c of bible.characters) {
      if (ids.has(c.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["characters"], message: `duplicate character id "${c.id}"` });
        continue;
      }
      ids.add(c.id);
    }
    const locIds = new Set<string>();
    for (const l of bible.locations) {
      if (locIds.has(l.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["locations"], message: `duplicate location id "${l.id}"` });
        continue;
      }
      locIds.add(l.id);
    }
  });

export type StoryBibleLlm = z.infer<typeof storyBibleLlmSchema>;

// ---------------------------------------------------------------------------
// Stage 2: planScenes → Scene[]
// ---------------------------------------------------------------------------

export const plannedSceneLlmSchema = z
  .object({
    order: z.number().int().min(1),
    scriptExcerpt: z.string().min(1),
    characterIds: z.array(z.string()).default([]),
    locationId: z.string().nullable().optional(),
    action: z.string().min(1),
    emotion: z.string().nullable().optional(),
    composition: z.string().default(""),
    continuityNotes: z.string().default(""),
  })
  .superRefine((scene, ctx) => {
    if (scene.characterIds.length > 0 && new Set(scene.characterIds).size !== scene.characterIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["characterIds"],
        message: "duplicate characterIds in scene",
      });
    }
  });

export const scenePlanLlmSchema = z
  .object({
    scenes: z.array(plannedSceneLlmSchema).min(1),
  })
  .superRefine((plan, ctx) => {
    // Sequential 1..N ordering is required for deterministic scene numbering.
    plan.scenes.forEach((s, i) => {
      if (s.order !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", i, "order"],
          message: `scene order must be sequential starting at 1: expected ${i + 1}, got ${s.order}`,
        });
      }
    });
  });

export type ScenePlanLlm = z.infer<typeof scenePlanLlmSchema>;
export type PlannedSceneLlm = z.infer<typeof plannedSceneLlmSchema>;
