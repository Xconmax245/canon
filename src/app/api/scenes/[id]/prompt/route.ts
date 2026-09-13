import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk, readJsonBody } from "@/lib/http";

/**
 * PATCH /api/scenes/:id/prompt — user edits a scene's prompt.
 * Sets promptSource = "user-edited". Regenerating the scene reuses this saved
 * edit and never silently overwrites it with a fresh auto-build.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJsonBody<{ prompt?: string }>(req);

    if (!body.prompt || body.prompt.trim().length < 10) {
      throw new ApiError(400, "invalid_prompt", "prompt is required (min 10 characters)");
    }

    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) throw new ApiError(404, "scene_not_found", "Scene not found");

    const updated = await prisma.scene.update({
      where: { id },
      data: { prompt: body.prompt.trim(), promptSource: "user_edited" },
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
