import { reconcileStaleJobs } from "@/lib/generation/reconciler";
import { logger } from "@/lib/logger";

/**
 * Reconciliation sweep — run via Supabase pg_cron + pg_net (or cron-job.org).
 * Safety net for missed/dropped webhooks: polls recordInfo for jobs stuck in
 * active states and re-drives recent download_failed jobs.
 *
 * Protected with INTERNAL_RECONCILE_SECRET: `Authorization: Bearer <SECRET>`.
 */
async function run(req: Request) {
  const secret = process.env.INTERNAL_RECONCILE_SECRET;
  
  if (process.env.NODE_ENV !== "development") {
    if (!secret) {
      logger.error("cron.reconcile_error", { error: "INTERNAL_RECONCILE_SECRET not set in production" });
      return Response.json({ error: "server_configuration_error" }, { status: 500 });
    }
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await reconcileStaleJobs();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.reconcile_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return run(req);
}
