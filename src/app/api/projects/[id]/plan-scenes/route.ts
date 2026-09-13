import { planProjectScenes } from "@/lib/services/story-service";
import { handleRouteError, jsonOk } from "@/lib/http";

/**
 * POST /api/projects/:id/plan-scenes — run scene planning.
 * Stage 2 of 3. Scenes are tagged with identityLockRequirement here, BEFORE
 * any prompt generation runs.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const scenes = await planProjectScenes(id);
    return jsonOk({ scenes });
  } catch (err) {
    return handleRouteError(err);
  }
}
