import { reconcileStaleJobs } from "@/lib/generation/reconciler";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Reconciliation sweep — run every few minutes (e.g. Vercel Cron).
 * Safety net for missed/dropped webhooks: polls recordInfo for jobs stuck in
 * active states and re-drives recent download_failed jobs.
 *
 * Protect with CRON_SECRET: `Authorization: Bearer <CRON_SECRET>`.
 * (Vercel Cron sends this header automatically when CRON_SECRET is set.)
 */
async function run(req: Request) {
  const secret = env.app.cronSecret();
  if (secret) {
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

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
