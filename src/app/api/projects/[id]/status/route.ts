import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk } from "@/lib/http";

/**
 * GET /api/projects/:id/status — overall progress:
 * analysis state, planning state, per-scene generation states, budget.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { order: "asc" }, select: { id: true, order: true, status: true } },
        _count: { select: { scenes: true } },
      },
    });
    if (!project) throw new ApiError(404, "project_not_found", "Project not found");

    const activeJobs = await prisma.generationJob.count({
      where: { scene: { projectId: id }, state: { in: ["waiting", "queuing", "generating", "downloading"] } },
    });
    const succeeded = project.scenes.filter((s) => s.status === "success").length;
    const failed = project.scenes.filter(
      (s) => s.status === "fail" || s.status === "download_failed",
    ).length;

    // Budget (section 13): actual credits consumed, summed from KIE responses.
    const creditsAgg = await prisma.generationJob.aggregate({
      where: { scene: { projectId: id } },
      _sum: { creditsConsumed: true },
    });

    return jsonOk({
      projectId: project.id,
      status: project.status,
      analysisError: project.analysisError ?? null,
      analysis: { storyBibleReady: Boolean(project.storyBible) },
      planning: { sceneCount: project._count.scenes },
      generation: {
        totalScenes: project._count.scenes,
        succeeded,
        failed,
        activeJobs,
        allDone: activeJobs === 0 && succeeded + failed === project._count.scenes,
      },
      budget: {
        generationLimit: project.generationLimit,
        imagesGenerated: succeeded,
        creditsConsumed: creditsAgg._sum.creditsConsumed ?? 0,
        remaining: Math.max(0, project.generationLimit - succeeded),
      },
      scenes: project.scenes,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
