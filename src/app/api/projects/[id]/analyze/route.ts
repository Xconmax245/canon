import { analyzeProject } from "@/lib/services/story-service";
import { handleRouteError, jsonOk } from "@/lib/http";

export const maxDuration = 60; // OpenAI LLM calls can take 20-40s

/**
 * POST /api/projects/:id/analyze — run story analysis → Story Bible.
 * Stage 1 of 3. Independent of scene planning and prompt generation.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const bible = await analyzeProject(id);
    return jsonOk({ storyBible: bible });
  } catch (err) {
    return handleRouteError(err);
  }
}
