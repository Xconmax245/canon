import { generatePrompt } from "@/lib/llm/openai-provider";
import type { PlannedSceneLlm, StoryBibleLlm } from "@/lib/llm/schemas";
import { KIE_LANE_MODELS } from "@/lib/kie/models";
import {
  buildFlux2MultiPrompt,
  buildIdeogramCharacterPrompt,
  buildTextToImagePrompt,
  type BuiltPrompt,
  type PromptBuildContext,
} from "@/lib/prompt-engine/lanes";
import { selectModel } from "@/lib/prompt-engine/router";
import type { IdentityLockRequirement, ProviderLaneName } from "@/lib/types";

/**
 * Prompt engine facade. Given a scene + bible + project style directive:
 *  1. lane = selectModel(scene.identityLockRequirement)
 *  2. narrative = LLM stage-3 prompt (skipped if a saved user edit exists)
 *  3. final prompt = per-lane deterministic builder wrapping the narrative
 */

export { selectModel };
export type { BuiltPrompt };
/** Deterministic identity/state/location block shared by all lanes. */
export function buildIdentityBlock(
  scene: PlannedSceneLlm,
  bible: StoryBibleLlm,
): string {
  const parts: string[] = [];

  const states = bible.characterStates.filter(
    (s) => scene.characterIds.includes(s.characterId) && s.sceneRef === scene.order.toString(),
  );

  for (const cid of scene.characterIds) {
    const c = bible.characters.find((x) => x.id === cid);
    if (!c) continue;
    const change = states.find((s) => s.characterId === cid)?.changes;
    parts.push(
      change
        ? `${c.canonicalDescription}; current state: ${change}`
        : c.canonicalDescription,
    );
  }

  const loc = bible.locations.find((l) => l.id === scene.locationId);
  if (loc) parts.push(`Setting: ${loc.canonicalDescription}`);

  if (scene.composition) parts.push(scene.composition);
  if (scene.continuityNotes) parts.push(scene.continuityNotes);

  return parts.join(". ").replace(/\.\.+/g, ".").trim();
}

export interface BuildScenePromptArgs {
  scene: PlannedSceneLlm & { identityLockRequirement: IdentityLockRequirement };
  bible: StoryBibleLlm;
  styleDirective: string;
  aspectRatio: string;
}

export async function buildScenePrompt(
  args: BuildScenePromptArgs,
): Promise<BuiltPrompt & { lane: ProviderLaneName }> {
  const lane = selectModel(args.scene.identityLockRequirement);
  const kieModel = KIE_LANE_MODELS[lane];

  const narrative = await generatePrompt(args.scene, args.bible, args.styleDirective);
  const identityBlock = buildIdentityBlock(args.scene, args.bible);

  const ctx: PromptBuildContext = {
    styleDirective: args.styleDirective,
    aspectRatio: args.aspectRatio,
    identityBlock,
    narrative,
    model: kieModel,
  };

  switch (lane) {
    case "text-to-image":
      return { ...buildTextToImagePrompt(ctx), lane };
    case "ideogram-character":
      return { ...buildIdeogramCharacterPrompt(ctx), lane };
    case "flux2-multi":
      return {
        ...buildFlux2MultiPrompt({ ...ctx, referenceCount: countReferenceImages(args.scene, args.bible) }),
        lane,
      };
  }
}

export { KIE_LANE_MODELS };

export function countReferenceImages(
  scene: PlannedSceneLlm,
  bible: StoryBibleLlm,
): number {
  return scene.characterIds.reduce((n, cid) => {
    const c = bible.characters.find((x) => x.id === cid);
    return n + (c?.referenceImageUrls.length ?? 0);
  }, 0);
}
