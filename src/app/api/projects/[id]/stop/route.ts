import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk } from "@/lib/http";

/**
 * POST /api/projects/:id/stop
 * Sets the project status to "cancelled", stopping any further scenes from being dispatched
 * in the generation loop.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError(404, "project_not_found", "Project not found");

    if (project.status === "completed" || project.status === "failed") {
      throw new ApiError(400, "invalid_state", "Project has already finished");
    }

    await prisma.project.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return jsonOk({ stopped: true, id });
  } catch (err) {
    return handleRouteError(err);
  }
}
