import OpenAI from "openai";
import { z } from "zod";
import type {
  LlmChatClient,
  LlmMessage,
  StructuredCallOptions,
} from "@/lib/llm/gateway";
import { callStructuredWithRetry } from "@/lib/llm/gateway";
import {
  scenePlanLlmSchema,
  storyBibleLlmSchema,
  type PlannedSceneLlm,
  type ScenePlanLlm,
  type StoryBibleLlm,
} from "@/lib/llm/schemas";
import { env } from "@/lib/env";
import { computeIdentityLock, type StoryBible } from "@/lib/types";

/**
 * OpenAI-backed LLM provider — the "brain".
 *
 * Three separate, independently retryable stages (never collapsed into one):
 *   1. analyzeStory   — script → Story Bible
 *   2. planScenes     — script + bible → ordered Scene[]
 *   3. generatePrompt — scene + bible + style directive → final image prompt
 *
 * Stages 1 and 2 use OpenAI structured outputs (json_schema response format)
 * and are validated with Zod on the application side.
 */

let clientSingleton: OpenAI | undefined;

function getClient(): OpenAI {
  if (!clientSingleton) {
    clientSingleton = new OpenAI({ apiKey: env.openai.apiKey() });
  }
  return clientSingleton;
}

// ---------------------------------------------------------------------------
// Structured-output JSON schemas
// ---------------------------------------------------------------------------

const STORY_BIBLE_JSON_SCHEMA = {
  name: "story_bible",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      genre: { type: "string" },
      tone: { type: "string" },
      visualMotifs: { type: "array", items: { type: "string" } },
      characters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "stable lowercase slug id, e.g. 'maya'",
            },
            name: { type: "string" },
            canonicalDescription: {
              type: "string",
              description:
                "Permanent, unchanging visual identity: age range, build, hair, eyes, distinguishing features, baseline outfit. Never scene-specific state.",
            },
            referenceImageUrls: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "canonicalDescription", "referenceImageUrls"],
          additionalProperties: false,
        },
      },
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "stable lowercase slug id, e.g. 'rooftop'" },
            name: { type: "string" },
            canonicalDescription: {
              type: "string",
              description: "Permanent visual identity of the place.",
            },
            referenceImageUrls: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "canonicalDescription", "referenceImageUrls"],
          additionalProperties: false,
        },
      },
      characterStates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            characterId: { type: "string" },
            sceneRef: { type: "string", description: "scene 'id' this state change starts at" },
            changes: {
              type: "string",
              description:
                "Mutable, scene-linked state delta, e.g. 'torn shirt, cut above left eyebrow'.",
            },
          },
          required: ["characterId", "sceneRef", "changes"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "logline", "genre", "tone", "visualMotifs", "characters", "locations", "characterStates"],
    additionalProperties: false,
  },
} as const;

const SCENE_PLAN_JSON_SCHEMA = {
  name: "scene_plan",
  schema: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            order: { type: "integer", description: "1-based sequential position" },
            scriptExcerpt: { type: "string", description: "short verbatim excerpt of the script this scene covers" },
            characterIds: {
              type: "array",
              items: { type: "string" },
              description: "ids of characters visibly present in this scene (from the story bible)",
            },
            locationId: {
              type: ["string", "null"],
              description: "id of the location from the story bible, or null if ambiguous/none",
            },
            action: { type: "string", description: "what is happening, concrete and visual" },
            emotion: { type: ["string", "null"], description: "dominant emotion/mood of the scene" },
            composition: { type: "string", description: "framing/camera suggestion, e.g. 'low-angle wide shot'" },
            continuityNotes: { type: "string", description: "visual continuity notes vs neighboring scenes" },
          },
          required: ["order", "scriptExcerpt", "characterIds", "locationId", "action", "emotion", "composition", "continuityNotes"],
          additionalProperties: false,
        },
      },
    },
    required: ["scenes"],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// OpenAI chat client adapter for the gateway
// ---------------------------------------------------------------------------

function makeChatClient(): LlmChatClient {
  return {
    async completeStructured(messages, jsonSchema, model): Promise<string> {
      const openai = getClient();
      const response = await openai.chat.completions.create({
        model: model ?? env.openai.model(),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: jsonSchema.name,
            schema: jsonSchema.schema as Record<string, unknown>,
            strict: true,
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned an empty completion");
      }
      return content;
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 1: analyzeStory
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM = `You are a story analyst for a story-to-image storyboard system.
Given a script, produce a Story Bible: the stable visual DNA of the story.

Rules:
- Characters get a stable lowercase-slug "id" (e.g. "maya", "old_man_jenkins").
- canonicalDescription must be PERMANENT visual identity only (age, build, hair, eyes, ethnicity, distinguishing features, baseline outfit). Never include scene-specific conditions like injuries, dirt, or damaged clothing — those belong in characterStates.changes.
- characterStates entries describe scene-linked MUTABLE state ("torn shirt", "cut above left eyebrow") with the scene id where the change first applies. Historical states remain queryable; never fold them into canonicalDescription.
- Locations get stable lowercase-slug ids and permanent visual descriptions.
- Be concrete and visual. If the script is minimal, invent reasonable visual details consistent with the text.
- referenceImageUrls must be [] — image references are attached later by the application.`;

export async function analyzeStory(script: string): Promise<StoryBibleLlm> {
  const opts: StructuredCallOptions<StoryBibleLlm> = {
    system: ANALYZE_SYSTEM,
    user: `Analyze this script and return the Story Bible.\n\n<script>\n${script}\n</script>`,
    jsonSchema: STORY_BIBLE_JSON_SCHEMA,
    zodSchema: storyBibleLlmSchema,
  };
  return callStructuredWithRetry(makeChatClient(), opts);
}

// ---------------------------------------------------------------------------
// Stage 2: planScenes
// ---------------------------------------------------------------------------

const PLAN_SYSTEM = `You are a storyboard scene planner for a story-to-image system.
Given a script and a Story Bible, break the story into an ordered list of scenes.

Rules:
- Output 6-20 scenes for a typical script; fewer only if the script is very short.
- order must be sequential integers starting at 1.
- characterIds must reference character ids from the provided Story Bible, and only characters who are VISIBLY PRESENT in the scene.
- locationId must reference a location id from the Story Bible, or null.
- scriptExcerpt is a short verbatim quote from the script for this scene.
- action must be a concrete, visually renderable description of what happens.
- composition should suggest framing/camera (e.g. "close-up", "wide establishing shot", "over-the-shoulder").
- continuityNotes should note what must stay visually consistent with adjacent scenes (state, lighting, time of day).`;

export async function planScenes(script: string, bible: StoryBibleLlm): Promise<ScenePlanLlm> {
  const opts: StructuredCallOptions<ScenePlanLlm> = {
    system: PLAN_SYSTEM,
    user:
      `Story Bible:\n${JSON.stringify(bible, null, 2)}\n\n` +
      `Script:\n<script>\n${script}\n</script>\n\n` +
      `Return the ordered scene plan as JSON.`,
    jsonSchema: SCENE_PLAN_JSON_SCHEMA,
    zodSchema: scenePlanLlmSchema,
  };
  return callStructuredWithRetry(makeChatClient(), opts);
}

// ---------------------------------------------------------------------------
// Stage 3: generatePrompt
// ---------------------------------------------------------------------------

const PROMPT_SYSTEM = `You are a prompt engineer for AI image generation.
Write ONE final image-generation prompt (a single paragraph, 60-160 words, English only).

The prompt must incorporate, in this priority:
1. The visual style directive (project-level look).
2. Each character's canonicalDescription — verbatim traits (age, hair, eyes, build, distinguishing features), never contradicting them.
3. Any scene-linked state changes for the characters in THIS scene (e.g. "torn shirt, cut above left eyebrow").
4. The location's canonical look.
5. The action and emotional tone of the scene.
6. Composition / camera framing.
7. Continuity notes (lighting, time of day, wardrobe continuity).

Hard rules:
- Do not name characters (image models don't know them); describe them fully instead.
- No meta language ("in this scene", "the story"), no dialogue, no camera-brand names.
- Output ONLY the prompt text. No quotes, no preamble, no lists.`;

export async function generatePrompt(
  scene: PlannedSceneLlm,
  bible: StoryBibleLlm,
  styleDirective: string,
): Promise<string> {
  // Only include bible entities relevant to this scene to keep prompts tight.
  const characters = bible.characters.filter((c) => scene.characterIds.includes(c.id));
  const location = bible.locations.find((l) => l.id === scene.locationId);
  const states = bible.characterStates.filter(
    (s) => scene.characterIds.includes(s.characterId) && s.sceneRef === scene.order?.toString(),
  );

  const payload = {
    styleDirective,
    characters: characters.map((c) => ({
      name: c.name,
      canonicalDescription: c.canonicalDescription,
      stateInThisScene: states.find((s) => s.characterId === c.id)?.changes || "none",
    })),
    location: location
      ? { name: location.name, canonicalDescription: location.canonicalDescription }
      : null,
    scene: {
      order: scene.order,
      action: scene.action,
      emotion: scene.emotion ?? null,
      composition: scene.composition,
      continuityNotes: scene.continuityNotes,
    },
    scriptExcerpt: scene.scriptExcerpt,
  };

  const user = `Build the final image prompt from this JSON:\n${JSON.stringify(payload, null, 2)}`;

  const raw = await callStructuredWithRetry(makeChatClient(), {
    system: PROMPT_SYSTEM,
    user,
    jsonSchema: {
      name: "image_prompt",
      schema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    zodSchema: z.object({ prompt: z.string().min(20).max(2000) }),
  });

  return raw.prompt;
}

// Re-export for convenience so services can use the same primitives.
export type { LlmMessage };
export { computeIdentityLock };
