import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { analyzeStory, planScenes, withIdentityLock } from "@/lib/llm";
import { buildScenePrompt } from "@/lib/prompt-engine";
import type { Prisma } from "@/generated/prisma";
import type { StoryBibleLlm, PlannedSceneLlm } from "@/lib/llm/schemas";
import type { IdentityLockRequirement } from "@/lib/types";

/**
 * Story orchestration: three separate LLM stages, each persisted separately
 * so a failure in a later stage never invalidates the earlier ones.
 */

export async function analyzeProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "project_not_found", "Project not found");
  if (project.status === "analyzing") {
    throw new ApiError(409, "already_running", "Story analysis already in progress");
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: "analyzing", analysisError: null } });

  try {
    const bibleLlm = await analyzeStory(project.script);

    // Enrich LLM bible with stored reference image URLs (ours, not the LLM's).
    const existing = (project.storyBible as unknown as StoryBibleLlm | null) ?? null;
    const merged = mergeReferenceImages(bibleLlm, existing);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "analyzed", storyBible: merged as unknown as Prisma.InputJsonValue },
    });
    return merged;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Story analysis failed";
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed", analysisError: message },
    });
    throw new ApiError(502, "analysis_failed", `Story analysis failed: ${message}`);
  }
}

function mergeReferenceImages(
  fresh: StoryBibleLlm,
  previous: StoryBibleLlm | null,
): StoryBibleLlm {
  if (!previous) return fresh;
  const prevChars = new Map(previous.characters.map((c) => [c.id, c.referenceImageUrls ?? []]));
  const prevLocs = new Map(previous.locations.map((l) => [l.id, l.referenceImageUrls ?? []]));
  return {
    ...fresh,
    characters: fresh.characters.map((c) => ({
      ...c,
      referenceImageUrls: prevChars.get(c.id) ?? c.referenceImageUrls ?? [],
    })),
    locations: fresh.locations.map((l) => ({
      ...l,
      referenceImageUrls: prevLocs.get(l.id) ?? l.referenceImageUrls ?? [],
    })),
  };
}

export async function planProjectScenes(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "project_not_found", "Project not found");
  if (!project.storyBible) {
    throw new ApiError(409, "not_analyzed", "Run story analysis before scene planning");
  }
  const bible = project.storyBible as unknown as StoryBibleLlm;

  await prisma.project.update({ where: { id: projectId }, data: { status: "planning" } });

  try {
    const plan = await planScenes(project.script, bible);
    const scenes = withIdentityLock(plan.scenes); // identity lock detected at planning time

    // Replace any previous plan (regenerating a plan is allowed pre-generation).
    // Cascades clean up scenes' jobs/assets; character/location rows are scoped
    // to THIS project only.
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { projectId } }),
      prisma.characterState.deleteMany({ where: { character: { projectId } } }),
      prisma.character.deleteMany({ where: { projectId } }),
      prisma.location.deleteMany({ where: { projectId } }),
    ]);

    // Persist characters/locations with NEW DB ids, keeping the LLM slug ids
    // as the join key between the stored bible and scene characterIds.
    const charIdMap = new Map<string, string>(); // llm slug id -> db id
    for (const c of bible.characters) {
      const row = await prisma.character.create({
        data: {
          projectId,
          name: c.name,
          canonicalDescription: c.canonicalDescription,
          referenceImageUrls: c.referenceImageUrls ?? [],
        },
      });
      charIdMap.set(c.id, row.id);
    }

    const locIdMap = new Map<string, string>(); // llm slug id -> db id
    for (const l of bible.locations) {
      const row = await prisma.location.create({
        data: {
          projectId,
          name: l.name,
          canonicalDescription: l.canonicalDescription,
          referenceImageUrls: l.referenceImageUrls ?? [],
        },
      });
      locIdMap.set(l.id, row.id);
    }

    // CharacterStates: sceneRef is the LLM scene order; convert to the new
    // scene DB ids once scenes are created. Historical states stay queryable.
    const sceneIdByOrder = new Map<number, string>();
    const createdScenes: { id: string; order: number }[] = [];

    for (const s of scenes) {
      const created = await prisma.scene.create({
        data: {
          projectId,
          order: s.order,
          scriptExcerpt: s.scriptExcerpt,
          characterIds: s.characterIds.map((cid) => charIdMap.get(cid) ?? cid),
          locationId: s.locationId ? (locIdMap.get(s.locationId) ?? null) : null,
          action: s.action,
          emotion: s.emotion ?? null,
          composition: s.composition,
          continuityNotes: s.continuityNotes,
          identityLockRequirement: s.identityLockRequirement,
          promptSource: "auto",
          status: "waiting",
        },
      });
      createdScenes.push({ id: created.id, order: created.order });
      sceneIdByOrder.set(s.order, created.id);
    }

    for (const st of bible.characterStates) {
      const characterDbId = charIdMap.get(st.characterId);
      const sceneDbId = sceneIdByOrder.get(Number(st.sceneRef));
      if (!characterDbId || !sceneDbId || !st.changes) continue;
      await prisma.characterState.create({
        data: {
          characterId: characterDbId,
          sceneId: sceneDbId,
          changes: st.changes,
        },
      });
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: "planned" } });
    return createdScenes;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene planning failed";
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed", analysisError: message } });
    throw new ApiError(502, "planning_failed", `Scene planning failed: ${message}`);
  }
}

/**
 * Build prompts for all planned scenes that don't have a user-edited prompt.
 * First generation always uses the auto-built prompt.
 */
export async function generatePromptsForProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "project_not_found", "Project not found");
  if (!project.storyBible) {
    throw new ApiError(409, "not_analyzed", "Run story analysis before prompt generation");
  }
  const bible = project.storyBible as unknown as StoryBibleLlm;
  const dbScenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  if (dbScenes.length === 0) {
    throw new ApiError(409, "not_planned", "Run scene planning before prompt generation");
  }

  // DB character ids -> LLM slug ids so the prompt engine can look up bible
  // entities. Characters were persisted in the bible's order, so index
  // alignment is the join; fall back to matching by name.
  const dbCharacters = await prisma.character.findMany({ where: { projectId } });
  const dbIdToSlug = new Map<string, string>();
  for (let i = 0; i < dbCharacters.length; i++) {
    const dbChar = dbCharacters[i];
    const byIndex = bible.characters[i];
    const byName = bible.characters.find((c) => c.name === dbChar.name);
    const slug = byIndex?.id ?? byName?.id;
    if (slug) dbIdToSlug.set(dbChar.id, slug);
  }

  // Build a bible view indexed by DB character ids so the prompt engine's
  // scene.characterIds (DB ids) resolve correctly.
  const bibleByDbIds: StoryBibleLlm = {
    ...bible,
    characters: bible.characters
      .map((c) => {
        let dbId: string | undefined;
        for (const [id, slug] of dbIdToSlug) {
          if (slug === c.id) {
            dbId = id;
            break;
          }
        }
        return dbId ? { ...c, id: dbId } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };

  const results: { sceneId: string; promptLength: number; skipped: boolean }[] = [];

  for (const scene of dbScenes) {
    // Any existing prompt (auto or user-edited) is kept. First generation uses
    // the auto-built prompt; explicit rebuilds go through regenerate-prompt.
    // This also keeps repeat /generate calls from silently changing prompts.
    if (scene.prompt.trim() !== "") {
      results.push({ sceneId: scene.id, promptLength: scene.prompt.length, skipped: true });
      continue;
    }

    const built = await buildScenePrompt({
      scene: {
        order: scene.order,
        scriptExcerpt: scene.scriptExcerpt,
        characterIds: scene.characterIds,
        locationId: undefined,
        action: scene.action,
        emotion: scene.emotion ?? undefined,
        composition: scene.composition,
        continuityNotes: scene.continuityNotes,
        identityLockRequirement: scene.identityLockRequirement as IdentityLockRequirement,
      },
      bible: bibleByDbIds,
      styleDirective: project.visualStyleDirective,
      aspectRatio: project.aspectRatio,
    });

    await prisma.scene.update({
      where: { id: scene.id },
      data: { prompt: built.prompt, promptSource: "auto" },
    });
    results.push({ sceneId: scene.id, promptLength: built.prompt.length, skipped: false });
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: "planned" } });
  return results;
}
