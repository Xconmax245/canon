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
    const auth = req.headers.get("authorization");
    // If it's not a cron job sending the secret, it must be an authenticated user
    // (middleware.ts ensures only logged-in users can reach this if no secret is sent)
    if (auth !== `Bearer ${secret}`) {
      // Allow client-side calls (middleware already checked Supabase Auth)
      const isClientCall = req.headers.get("cookie")?.includes("sb-");
      if (!isClientCall) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
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
