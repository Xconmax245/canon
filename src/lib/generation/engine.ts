import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createTask, buildCallBackUrl, getStatus } from "@/lib/kie/client";
import type { GenerationLane } from "@/lib/kie/types";
import { persistImage } from "@/lib/storage/supabase-storage";
import { isActiveJobState, type JobState } from "@/lib/types";
import { ApiError } from "@/lib/http";

/**
 * Generation job system (section 11).
 *
 * - Idempotency: one KIE task per `${sceneId}:${imageVersion}` — an existing
 *   job in an active state is returned instead of creating a duplicate.
 * - Webhook is the primary completion signal; a periodic reconciliation sweep
 *   polls recordInfo for jobs stuck in active states (section 11).
 * - Download is part of the state machine: fail vs download_failed are
 *   distinct because only one of them costs credits to retry.
 */

export function idempotencyKeyFor(sceneId: string, imageVersion: number): string {
  return `${sceneId}:${imageVersion}`;
}

// ---------------------------------------------------------------------------
// Start generation for a single scene (used by /generate and /regenerate)
// ---------------------------------------------------------------------------

export interface StartGenerationResult {
  jobId: string;
  state: JobState;
  imageVersion: number;
  reused: boolean;
}

export async function startGenerationForScene(
  sceneId: string,
  opts: { newVersion?: boolean } = {},
): Promise<StartGenerationResult> {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene) throw new ApiError(404, "scene_not_found", "Scene not found");
  const project = await prisma.project.findUnique({ where: { id: scene.projectId } });
  if (!project) throw new ApiError(404, "project_not_found", "Project not found");

  if (!scene.prompt || scene.prompt.trim() === "") {
    throw new ApiError(400, "prompt_missing", "Scene has no prompt yet; generate the prompt first");
  }

  // Enforce the project-level generation limit. Regenerations count toward
  // the same limit as original generations (section 13).
  const usedVersions = await prisma.asset.count({ where: { scene: { projectId: project.id } } });
  const inFlight = await prisma.generationJob.count({
    where: { scene: { projectId: project.id }, state: { in: ["waiting", "queuing", "generating", "downloading"] } },
  });
  const consumed = usedVersions + inFlight;
  if (consumed >= project.generationLimit) {
    throw new ApiError(
      402,
      "generation_limit_reached",
      `Project generation limit reached (${project.generationLimit} images)`,
    );
  }

  const imageVersion = opts.newVersion ? scene.imageVersion + 1 : Math.max(scene.imageVersion, 1);
  const idempotencyKey = idempotencyKeyFor(scene.id, imageVersion);

  // Idempotency: never create a second KIE task for the same scene+version.
  // A terminal job with the same key is fine: regenerate bumps the version.
  const existing = await prisma.generationJob.findUnique({ where: { idempotencyKey } });
  if (existing && isActiveJobState(existing.state as JobState)) {
    return { jobId: existing.id, state: existing.state as JobState, imageVersion, reused: true };
  }

  const laneName: GenerationLane = mapLane(scene.identityLockRequirement);

  // Terminal job with the same key (e.g. a dispatch failure): retire its key
  // so this scene+version can be re-dispatched. The old row stays queryable.
  // Active jobs were already returned above, so `existing` here is terminal.
  if (existing) {
    await prisma.generationJob.update({
      where: { id: existing.id },
      data: { idempotencyKey: `${existing.id}:retired` },
    });
  }

  const job = await prisma.generationJob.create({
    data: {
      sceneId: scene.id,
      imageVersion,
      idempotencyKey,
      provider: laneName === "text-to-image" ? "text_to_image" : laneName === "ideogram-character" ? "ideogram_character" : "flux2_multi",
      state: "waiting",
      attempts: 1,
    },
  });

  // Update scene bookkeeping.
  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      imageVersion,
      status: "waiting",
    },
  });

  // Dispatch to KIE. Webhook is primary; reconciler catches misses.
  try {
    const refs = await resolveReferenceImages(scene.projectId, scene);
    // Reference-dependent lanes can't run without inputs: ideogram/character
    // requires a character reference, flux-2 image-to-image requires
    // input_urls. On a first render there are no references yet — fall back
    // to the cheap text lane instead of failing the task. Once reference
    // assets exist (e.g. via a character-sheet feature), the proper lane
    // applies automatically.
    const effectiveLane: GenerationLane =
      laneName !== "text-to-image" && refs.length === 0 ? "text-to-image" : laneName;

    const { taskId } = await createTask({
      lane: effectiveLane,
      callBackUrl: buildCallBackUrl(),
      input: {
        prompt: scene.prompt,
        referenceImageUrls: refs,
        aspectRatio: project.aspectRatio,
      },
    });

    await prisma.generationJob.update({
      where: { id: job.id },
      data: { providerTaskId: taskId, state: "queuing" },
    });
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "queuing" } });

    return { jobId: job.id, state: "queuing", imageVersion, reused: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "KIE task creation failed";
    logger.error("generation.dispatch_failed", { jobId: job.id, error: message });
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { state: "fail", lastError: message, completedAt: new Date() },
    });
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "fail" } });
    throw new ApiError(502, "kie_dispatch_failed", `Failed to start image generation: ${message}`);
  }
}

function mapLane(identityLock: string): GenerationLane {
  switch (identityLock) {
    case "single":
      return "ideogram-character";
    case "multi":
      return "flux2-multi";
    default:
      return "text-to-image";
  }
}
async function resolveReferenceImages(
  projectId: string,
  scene: { characterIds: string[] },
): Promise<string[]> {
  if (scene.characterIds.length === 0) return [];
  const characters = await prisma.character.findMany({
    where: { projectId, id: { in: scene.characterIds } },
  });
  return characters.flatMap((c) => c.referenceImageUrls);
}

// ---------------------------------------------------------------------------
// Job completion (from webhook payload or reconciler poll)
// ---------------------------------------------------------------------------

export interface ProcessJobCompletionArgs {
  providerTaskId: string;
  state?: string;
  resultUrls?: string[];
  creditsConsumed?: number;
  failMsg?: string;
}

export async function processJobCompletion(args: ProcessJobCompletionArgs): Promise<void> {
  const job = await prisma.generationJob.findFirst({
    where: { providerTaskId: args.providerTaskId },
  });
  if (!job) {
    logger.warn("generation.job_not_found_for_task", { providerTaskId: args.providerTaskId });
    return;
  }
  if (job.state === "success") return; // already fully processed
  if (job.state === "fail" || job.state === "download_failed") {
    // Terminal for this attempt; only the reconciler re-activates downloads.
    if (args.state !== "success") return;
  }

  if (args.state === "fail") {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        state: "fail",
        lastError: args.failMsg ?? "generation failed",
        creditsConsumed: args.creditsConsumed ?? job.creditsConsumed,
        completedAt: new Date(),
      },
    });
    await prisma.scene.update({ where: { id: job.sceneId }, data: { status: "fail" } });
    return;
  }

  if (args.state === "success") {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        state: "downloading",
        creditsConsumed: args.creditsConsumed ?? job.creditsConsumed,
      },
    });
    await prisma.scene.update({
      where: { id: job.sceneId },
      data: { status: "downloading" },
    });

    await runDownload(job.id, args.resultUrls ?? []);
  }
}

/** Pull the KIE image into Supabase Storage and persist an Asset row. */
export async function runDownload(jobId: string, resultUrls: string[]): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const url = resultUrls[0] ?? (await fetchFreshUrls(job.providerTaskId));
  if (!url) {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { state: "download_failed", lastError: "no result URL available", attempts: { increment: 1 } },
    });
    await prisma.scene.update({
      where: { id: job.sceneId },
      data: { status: "download_failed" },
    });
    return;
  }

  try {
    const stored = await persistImage(url, job.sceneId, job.imageVersion);
    await prisma.asset.upsert({
      where: { sceneId_imageVersion: { sceneId: job.sceneId, imageVersion: job.imageVersion } },
      create: {
        sceneId: job.sceneId,
        imageVersion: job.imageVersion,
        storageUrl: stored.storageUrl,
        generationJobId: job.id,
      },
      update: { storageUrl: stored.storageUrl, generationJobId: job.id },
    });
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { state: "success", completedAt: new Date(), lastError: null },
    });
    await prisma.scene.update({
      where: { id: job.sceneId },
      data: { status: "success", imageUrl: stored.storageUrl, imageVersion: job.imageVersion },
    });
    logger.info("generation.persisted", { jobId: job.id, sceneId: job.sceneId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "download failed";
    logger.warn("generation.download_failed", { jobId: job.id, error: message });
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { state: "download_failed", lastError: message, attempts: { increment: 1 } },
    });
    await prisma.scene.update({
      where: { id: job.sceneId },
      data: { status: "download_failed" },
    });
  }
}

async function fetchFreshUrls(providerTaskId: string | null): Promise<string[]> {
  if (!providerTaskId) return [];
  try {
    const status = await getStatus(providerTaskId);
    // KIE result URLs expire fast (as short as 20 min). If the URL is gone,
    // report that explicitly so callers can escalate to a new generation
    // instead of retrying a dead download forever.
    if (status.state === "success" && !(status.resultUrls && status.resultUrls.length > 0)) {
      logger.warn("generation.result_urls_expired", { providerTaskId });
      return [];
    }
    return status.resultUrls ?? [];
  } catch {
    return [];
  }
}

/**
 * A download_failed job is only recoverable while its KIE URL is still live.
 * Detect the dead-URL case: resultJson gone from recordInfo, or the URL 404s.
 */
async function downloadIsUnrecoverable(job: { providerTaskId: string | null }): Promise<boolean> {
  if (!job.providerTaskId) return true;
  try {
    const status = await getStatus(job.providerTaskId);
    if (status.state !== "success" || !status.resultUrls?.length) return true;
    const probe = await fetch(status.resultUrls[0], { method: "GET", cache: "no-store" });
    if (probe.ok) return false;
    if (probe.status === 404 || probe.status === 403 || probe.status === 410) return true;
    return false; // transient error — one more download try is reasonable
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Task record gone from KIE entirely (expired record / unknown id):
    // the result URL can never come back → escalate to a new generation.
    if (/recordInfo is null|Task not found|404/i.test(msg)) return true;
    return false; // other errors (timeouts, 5xx) — one more try is fair
  }
}

// ---------------------------------------------------------------------------
// Retry paths (section 15)
// ---------------------------------------------------------------------------

/** Retry the DOWNLOAD only — no extra credits, requires the KIE URL to still be live. */
export async function retryDownload(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError(404, "job_not_found", "Job not found");
  if (job.state !== "download_failed") {
    throw new ApiError(409, "not_retryable", `Job state is ${job.state}; only download_failed jobs can retry the download`);
  }

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { state: "downloading", attempts: { increment: 1 } },
  });

  await runDownload(job.id, []);
}

/** Retry a failed generation — creates a NEW KIE task and costs credits again. */
export async function retryFailedGeneration(sceneId: string): Promise<StartGenerationResult> {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene) throw new ApiError(404, "scene_not_found", "Scene not found");

  const latest = await prisma.generationJob.findFirst({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
  });

  if (latest && latest.state === "download_failed") {
    // Downloads are free — never re-bill for a storage problem... while the
    // URL is live. Once KIE's result URL has expired, a download retry can
    // never succeed: escalate to a fresh generation (bumps the version) so
    // the scene stays recoverable.
    // KIE's edge serves stale resultJson for deleted files, so URL liveness
    // probing is unreliable. Make it deterministic: one free download retry,
    // then escalate to a fresh generation. Also escalate immediately when the
    // probe proves the URL/task is gone for good.
    if (latest.attempts >= 2 || (await downloadIsUnrecoverable(latest))) {
      return startGenerationForScene(sceneId, { newVersion: true });
    }
    await retryDownload(latest.id);
    return { jobId: latest.id, state: "downloading", imageVersion: latest.imageVersion, reused: true };
  }

  if (latest && latest.state === "fail" && latest.providerTaskId) {
    // Bump the version so the idempotency key allows a fresh KIE task.
    return startGenerationForScene(sceneId, { newVersion: true });
  }

  if (latest && latest.state === "fail") {
    // Dispatch never reached KIE (no taskId) — reuse the same version.
    return startGenerationForScene(sceneId);
  }

  if (latest && isActiveJobState(latest.state)) {
    return { jobId: latest.id, state: latest.state, imageVersion: latest.imageVersion, reused: true };
  }

  return startGenerationForScene(sceneId, { newVersion: true });
}
