import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk } from "@/lib/http";
import { buildScenePrompt } from "@/lib/prompt-engine";
import type { StoryBibleLlm } from "@/lib/llm/schemas";
import type { IdentityLockRequirement } from "@/lib/types";

/**
 * POST /api/scenes/:id/regenerate-prompt — explicit "regenerate prompt"
 * action (distinct from "regenerate image"). Rebuilds the prompt from the
 * Story Bible and resets promptSource back to "auto".
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const scene = await prisma.scene.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!scene) throw new ApiError(404, "scene_not_found", "Scene not found");
    if (!scene.project.storyBible) {
      throw new ApiError(409, "not_analyzed", "Story Bible missing; run analysis first");
    }
    const bible = scene.project.storyBible as unknown as StoryBibleLlm;

    const built = await buildScenePrompt({
      scene: {
        order: scene.order,
        scriptExcerpt: scene.scriptExcerpt,
        characterIds: scene.characterIds,
        locationId: scene.locationId ?? undefined,
        action: scene.action,
        emotion: scene.emotion ?? undefined,
        composition: scene.composition,
        continuityNotes: scene.continuityNotes,
        identityLockRequirement: scene.identityLockRequirement as IdentityLockRequirement,
      },
      bible,
      styleDirective: scene.project.visualStyleDirective,
      aspectRatio: scene.project.aspectRatio,
    });

    const updated = await prisma.scene.update({
      where: { id },
      data: { prompt: built.prompt, promptSource: "auto" },
    });

    return jsonOk({
      sceneId: updated.id,
      prompt: updated.prompt,
      promptSource: updated.promptSource,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
