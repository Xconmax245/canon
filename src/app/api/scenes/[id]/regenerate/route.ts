import { handleRouteError, jsonOk } from "@/lib/http";
import { retryFailedGeneration } from "@/lib/generation/engine";

/**
 * POST /api/scenes/:id/regenerate — regenerate image for one scene.
 * Creates a NEW imageVersion + new Asset row; history is never overwritten.
 * If the previous job only failed to DOWNLOAD, this retries the download for
 * free instead of spending credits on a new generation.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await retryFailedGeneration(id);
    return jsonOk({
      sceneId: id,
      jobId: result.jobId,
      state: result.state,
      imageVersion: result.imageVersion,
      reused: result.reused,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
