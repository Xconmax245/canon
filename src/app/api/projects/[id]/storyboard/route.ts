import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonOk } from "@/lib/http";

/**
 * GET /api/projects/:id/storyboard — scenes + current assets.
 * Includes image version history per scene (rollback stays queryable).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        scenes: {
          orderBy: { order: "asc" },
          include: {
            assets: { orderBy: { imageVersion: "desc" } },
          },
        },
        characters: true,
        locations: true,
      },
    });
    if (!project) throw new ApiError(404, "project_not_found", "Project not found");

    return jsonOk({
      project: {
        id: project.id,
        status: project.status,
        visualStyleDirective: project.visualStyleDirective,
        aspectRatio: project.aspectRatio,
        generationLimit: project.generationLimit,
      },
      characters: project.characters.map((c) => ({
        id: c.id,
        name: c.name,
        canonicalDescription: c.canonicalDescription,
        referenceImageUrls: c.referenceImageUrls,
      })),
      locations: project.locations.map((l) => ({
        id: l.id,
        name: l.name,
        canonicalDescription: l.canonicalDescription,
        referenceImageUrls: l.referenceImageUrls,
      })),
      scenes: project.scenes.map((s) => ({
        id: s.id,
        order: s.order,
        scriptExcerpt: s.scriptExcerpt,
        action: s.action,
        emotion: s.emotion,
        identityLockRequirement: s.identityLockRequirement,
        prompt: s.prompt,
        promptSource: s.promptSource,
        status: s.status,
        imageVersion: s.imageVersion,
        imageUrl: s.imageUrl,
        assets: s.assets.map((a) => ({
          id: a.id,
          imageVersion: a.imageVersion,
          storageUrl: a.storageUrl,
          createdAt: a.createdAt,
        })),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
