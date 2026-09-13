import { prisma } from "@/lib/db";
import { ApiError, handleRouteError, jsonCreated, readJsonBody } from "@/lib/http";
import { isAspectRatio, isStylePreset } from "@/lib/types";

/**
 * POST /api/projects — create project (script, styleDirective, aspectRatio)
 * GET  /api/projects — list projects (lightweight)
 */

interface CreateProjectBody {
  script?: string;
  visualStyleDirective?: string;
  aspectRatio?: string;
  generationLimit?: number;
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody<CreateProjectBody>(req);

    if (!body.script || body.script.trim().length < 20) {
      throw new ApiError(400, "invalid_script", "script is required (min 20 characters)");
    }
    const style = body.visualStyleDirective?.trim() || "cinematic";
    if (!isStylePreset(style) && style.length < 3) {
      throw new ApiError(
        400,
        "invalid_style",
        "visualStyleDirective must be a preset id (cinematic, anime, comic, photorealistic, fantasy, horror, illustration) or free text (min 3 chars)",
      );
    }
    const aspectRatio = body.aspectRatio?.trim() || "16:9";
    if (!isAspectRatio(aspectRatio)) {
      throw new ApiError(400, "invalid_aspect_ratio", `aspectRatio must be one of: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9`);
    }
    const generationLimit =
      typeof body.generationLimit === "number" && body.generationLimit > 0
        ? Math.floor(body.generationLimit)
        : 30;

    const project = await prisma.project.create({
      data: {
        script: body.script.trim(),
        visualStyleDirective: style,
        aspectRatio,
        generationLimit,
        status: "draft",
      },
    });

    return jsonCreated({
      id: project.id,
      status: project.status,
      visualStyleDirective: project.visualStyleDirective,
      aspectRatio: project.aspectRatio,
      generationLimit: project.generationLimit,
      createdAt: project.createdAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        visualStyleDirective: true,
        aspectRatio: true,
        generationLimit: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { scenes: true } },
      },
    });
    return Response.json({ projects });
  } catch (err) {
    return handleRouteError(err);
  }
}
