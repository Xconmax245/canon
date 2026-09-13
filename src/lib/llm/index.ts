/**
 * LLM layer facade. Implements the directive's LLMProvider interface:
 *
 *   interface LLMProvider {
 *     analyzeStory(script: string): Promise<StoryBible>;
 *     planScenes(script: string, bible: StoryBible): Promise<Scene[]>;
 *     generatePrompt(scene: Scene, bible: StoryBible, styleDirective: string): Promise<string>;
 *   }
 *
 * OpenAI is the brain; these functions are the ONLY entry point services use.
 */

import { analyzeStory, generatePrompt, planScenes } from "@/lib/llm/openai-provider";
import type {
  PlannedSceneLlm,
  StoryBibleLlm,
} from "@/lib/llm/schemas";
import { computeIdentityLock } from "@/lib/types";

export { analyzeStory, generatePrompt, planScenes };
export type { StoryBibleLlm, PlannedSceneLlm };

/**
 * Enrich planned scenes with identity-lock detection. Per the directive this
 * MUST happen at planning time — before any prompt generation runs — because
 * it drives the image-model router.
 */
export function withIdentityLock(scenes: PlannedSceneLlm[]) {
  return scenes.map((s) => ({
    ...s,
    locationId: s.locationId ?? undefined,
    emotion: s.emotion ?? undefined,
    identityLockRequirement: computeIdentityLock(s.characterIds.length),
  }));
}
