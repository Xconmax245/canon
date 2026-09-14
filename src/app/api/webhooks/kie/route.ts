import { verifyWebhookRequest } from "@/lib/kie/webhook";
import { processJobCompletion } from "@/lib/generation/engine";
import { logger } from "@/lib/logger";
import type { KieWebhookBody } from "@/lib/kie/types";
import { after } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/webhooks/kie — KIE completion callback (primary completion signal).
 *
 * Security: payloads are verified via HMAC-SHA256 before being trusted.
 * Unverified payloads are rejected outright; the reconciliation poll picks up
 * the real state for any task whose webhook we dropped.
 *
 * Performance: we respond 200 immediately after verification, then run the
 * heavy download+Supabase upload in an `after()` background task so Vercel's
 * function timeout never kills the upload mid-flight.
 */
export async function POST(req: Request) {
  let body: KieWebhookBody;
  try {
    body = (await req.json()) as KieWebhookBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const verification = await verifyWebhookRequest(req, body);
  if (!verification.ok) {
    logger.warn("kie.webhook_rejected", { reason: verification.reason });
    return Response.json({ error: verification.reason }, { status: 401 });
  }

  const p = verification.payload!;

  // Run the download + Supabase upload AFTER the response is sent.
  // This ensures KIE gets its 200 acknowledgement immediately, preventing
  // retries, and gives us the full platform background-task window for
  // the upload rather than racing against the 10s Vercel function limit.
  after(async () => {
    try {
      await processJobCompletion({
        providerTaskId: p.taskId,
        state: p.state ?? (body.code === 200 ? "success" : "fail"),
        resultUrls: p.resultUrls,
        creditsConsumed: p.creditsConsumed,
        failMsg: p.failMsg ?? (body.code !== 200 ? body.msg : undefined),
      });
    } catch (err) {
      // Never fail the webhook: the reconciler will re-drive the job if needed.
      logger.error("kie.webhook_processing_error", {
        taskId: p.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // KIE expects a 2xx to consider delivery successful.
  return Response.json({ status: "received" }, { status: 200 });
}
