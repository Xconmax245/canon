import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * KIE webhook signature verification.
 *
 * Official spec (docs.kie.ai/common-api/webhook-verification):
 *   signature = base64(HMAC-SHA256(`${taskId}.${timestampSeconds}`, webhookHmacKey))
 *   headers: X-Webhook-Timestamp (unix seconds), X-Webhook-Signature
 *
 * Unverified payloads are rejected outright; the reconciliation poll is the
 * safety net that picks up the real state.
 */

export interface WebhookHeaders {
  timestamp: string | null | undefined;
  signature: string | null | undefined;
}

export function verifyKieWebhook(
  taskId: string,
  timestamp: string,
  signature: string,
  hmacKey: string,
): boolean {
  if (!taskId || !timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", hmacKey)
    .update(`${taskId}.${timestamp}`)
    .digest("base64");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface VerifiedWebhook {
  taskId: string;
  state?: string;
  resultUrls?: string[];
  creditsConsumed?: number;
  failMsg?: string;
}

export interface WebhookVerificationResult {
  ok: boolean;
  reason?: string;
  payload?: VerifiedWebhook;
}

/**
 * Full verification pipeline for the webhook route:
 *  - requires headers + task id
 *  - rejects stale timestamps (replay guard)
 *  - verifies HMAC signature
 *  - accepts a shared-secret fallback when no HMAC key is configured
 */
export async function verifyWebhookRequest(
  req: Request,
  body: unknown,
): Promise<WebhookVerificationResult> {
  const hmacKey = env.kie.hmacKey();
  const sharedSecret = env.kie.webhookSecret();

  const headers: WebhookHeaders = {
    timestamp: req.headers.get("x-webhook-timestamp"),
    signature: req.headers.get("x-webhook-signature"),
  };

  const data = (body as { data?: { task_id?: string; taskId?: string } })?.data;
  const taskId = data?.task_id ?? data?.taskId;

  if (hmacKey) {
    if (!headers.timestamp || !headers.signature) {
      return { ok: false, reason: "missing webhook signature headers" };
    }
    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };
    const ageSec = Math.abs(Date.now() / 1000 - ts);
    if (ageSec > 10 * 60) return { ok: false, reason: "stale webhook timestamp (replay guard)" };

    if (!taskId) return { ok: false, reason: "missing task_id in webhook body" };
    if (!verifyKieWebhook(taskId, headers.timestamp, headers.signature, hmacKey)) {
      return { ok: false, reason: "invalid webhook signature" };
    }
  } else if (sharedSecret) {
    // Fallback: shared secret header (useful before the HMAC key is set up
    // in the KIE dashboard). Still rejects anyone without the secret.
    const got = req.headers.get("x-webhook-secret");
    if (!got || got !== sharedSecret) {
      return { ok: false, reason: "invalid webhook secret" };
    }
  } else {
    return {
      ok: false,
      reason:
        "webhook verification not configured: set KIE_WEBHOOK_HMAC_KEY (preferred) or KIE_WEBHOOK_SECRET",
    };
  }

  if (!taskId) return { ok: false, reason: "missing task_id in webhook body" };

  const raw = (body as { data?: { resultJson?: string } })?.data?.resultJson;
  let resultUrls: string[] | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { resultUrls?: string[] };
      resultUrls = parsed.resultUrls;
    } catch {
      // leave undefined; reconciliation poll will recover the real state
    }
  }

  const d = (body as { data?: Record<string, unknown> }).data ?? {};
  return {
    ok: true,
    payload: {
      taskId,
      state: typeof d.state === "string" ? d.state : undefined,
      resultUrls,
      creditsConsumed: typeof d.creditsConsumed === "number" ? d.creditsConsumed : undefined,
      failMsg: typeof d.failMsg === "string" ? d.failMsg : undefined,
    },
  };
}
