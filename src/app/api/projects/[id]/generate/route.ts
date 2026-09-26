import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk, readJsonBody } from "@/lib/http";
import { generatePromptsForProject } from "@/lib/services/story-service";
import { startGenerationForScene } from "@/lib/generation/engine";

export const maxDuration = 60; // Extend Vercel timeout to maximum allowed for Hobby/Pro limits

/**
 * POST /api/projects/:id/generate — start image generation for all planned scenes.
 *
 * Prompt rule (section 9): first generation always uses the auto-built prompt.
 * Scenes with promptSource="user_edited" keep their saved edit; scenes without
 * a prompt yet get one auto-built here.
 */

interface GenerateBody {
  /** Only generate scenes that have no successful image yet. Default true. */
  onlyPending?: boolean;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJsonBody<GenerateBody>(req).catch(() => ({ onlyPending: true }) as GenerateBody);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError(404, "project_not_found", "Project not found");

    // Auto-build prompts for scenes that still need one (respects user edits).
    await generatePromptsForProject(id);

    const scenes = await prisma.scene.findMany({
      where: { projectId: id },
      orderBy: { order: "asc" },
    });
    if (scenes.length === 0) {
      throw new ApiError(409, "not_planned", "Run scene planning before generating");
    }

    // Check if project was cancelled via the Stop button before dispatching
    const currentProject = await prisma.project.findUnique({ where: { id } });
    if (currentProject?.status === "cancelled") {
      return jsonOk({ started: 0, results: [] });
    }

    // Mark project as generating BEFORE dispatching so status is consistent
    // even if webhooks or reconciler fires before we return.
    await prisma.project.update({ where: { id }, data: { status: "generating" } });

    // Dispatch scenes SEQUENTIALLY with a small delay between each KIE call.
    // Promise.all was hammering KIE with all requests simultaneously, causing
    // rate-limit (429) errors that immediately failed most scenes.
    const results: Array<{ sceneId: string; jobId?: string; state?: string; error?: string }> = [];
    for (const scene of scenes) {
      if (body.onlyPending !== false && scene.status === "success") {
        results.push({ sceneId: scene.id, state: "success" });
        continue;
      }

      try {
        const r = await startGenerationForScene(scene.id);
        results.push({ sceneId: scene.id, jobId: r.jobId, state: r.state });
      } catch (err) {
        results.push({
          sceneId: scene.id,
          error: err instanceof Error ? err.message : "generation start failed",
        });
      }

      // Small pause between KIE dispatches to stay within rate limits.
      await new Promise((res) => setTimeout(res, 300));
    }

    return jsonOk({
      started: results.filter((r) => !r.error).length,
      results,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
