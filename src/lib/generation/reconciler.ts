import { prisma } from "@/lib/db";
import { getStatus } from "@/lib/kie/client";
import { processJobCompletion } from "@/lib/generation/engine";
import { logger } from "@/lib/logger";

/**
 * Reconciliation sweep — the safety net for missed/dropped webhooks.
 * KIE's retry behavior on failed webhook delivery is undocumented, so we
 * never rely on the webhook alone: any job stuck in waiting/queuing/generating
 * (or downloading with no persisted asset) past a reasonable age gets polled
 * via recordInfo and driven to completion.
 */

// In production, use 2 minutes so we don't hammer KIE with unnecessary polls.
// In dev, webhooks never reach localhost, so poll aggressively after 30s.
const STALE_AFTER_MS = process.env.NODE_ENV === "production" ? 2 * 60 * 1000 : 30 * 1000;
const MAX_JOB_AGE_MS = 30 * 60 * 1000; // 30 minutes → mark fail after this

export interface ReconcileResult {
  checked: number;
  completed: number;
  failed: number;
  stillActive: number;
}

export async function reconcileStaleJobs(): Promise<ReconcileResult> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  const cutoffAge = new Date(Date.now() - MAX_JOB_AGE_MS);

  const staleJobs = await prisma.generationJob.findMany({
    where: {
      state: { in: ["waiting", "queuing", "generating"] },
      createdAt: { lt: staleBefore },
      providerTaskId: { not: null },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  // Also re-drive download_failed jobs whose KIE URL may still be live
  // (only within the first 20 minutes, since some KIE URLs expire fast).
  const downloadRetryCutoff = new Date(Date.now() - 20 * 60 * 1000);
  const failedDownloads = await prisma.generationJob.findMany({
    where: {
      state: "download_failed",
      createdAt: { gte: downloadRetryCutoff },
      attempts: { lt: 3 },
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  const result: ReconcileResult = { checked: 0, completed: 0, failed: 0, stillActive: 0 };

  for (const job of staleJobs) {
    result.checked++;
    try {
      const status = await getStatus(job.providerTaskId!);
      if (status.state === "success" || status.state === "fail") {
        await processJobCompletion({
          providerTaskId: job.providerTaskId!,
          state: status.state,
          resultUrls: status.resultUrls,
          creditsConsumed: status.creditsConsumed,
          failMsg: status.failMsg,
        });
        if (status.state === "success") result.completed++;
        else result.failed++;
      } else if (new Date(job.createdAt) < cutoffAge) {
        // Extremely stale and still not done: mark as failed so the UI can
        // offer a (credit-costing) retry instead of hanging forever.
        await prisma.generationJob.update({
          where: { id: job.id },
          data: { state: "fail", lastError: "reconciler timeout: task did not complete in time", completedAt: new Date() },
        });
        await prisma.scene.update({ where: { id: job.sceneId }, data: { status: "fail" } });
        result.failed++;
      } else {
        result.stillActive++;
      }
    } catch (err) {
      logger.warn("reconcile.poll_error", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      result.stillActive++;
    }
  }

  for (const job of failedDownloads) {
    result.checked++;
    try {
      const { runDownload } = await import("@/lib/generation/engine");
      await runDownload(job.id, []); // runDownload re-fetches fresh URLs itself
      const after = await prisma.generationJob.findUnique({ where: { id: job.id } });
      if (after?.state === "success") result.completed++;
      else result.stillActive++; // still download_failed (escalation is the user's explicit call)
    } catch (err) {
      logger.warn("reconcile.download_retry_error", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      result.stillActive++;
    }
  }

  if (result.checked > 0) {
    logger.info("reconcile.sweep", { ...result });
  }
  return result;
}
