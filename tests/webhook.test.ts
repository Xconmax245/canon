import { describe, expect, it } from "vitest";
import { verifyKieWebhook, verifyWebhookRequest } from "@/lib/kie/webhook";
import crypto from "crypto";

function sign(taskId: string, timestamp: string, key: string): string {
  return crypto.createHmac("sha256", key).update(`${taskId}.${timestamp}`).digest("base64");
}

describe("verifyKieWebhook", () => {
  const key = "test-hmac-key";
  const taskId = "task_123";
  const ts = "1786427040";

  it("accepts a valid signature", () => {
    const sig = sign(taskId, ts, key);
    expect(verifyKieWebhook(taskId, ts, sig, key)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = sign(taskId, ts, key);
    expect(verifyKieWebhook("task_999", ts, sig, key)).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const sig = sign(taskId, ts, "other-key");
    expect(verifyKieWebhook(taskId, ts, sig, key)).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(verifyKieWebhook("", ts, sign(taskId, ts, key), key)).toBe(false);
    expect(verifyKieWebhook(taskId, "", sign(taskId, ts, key), key)).toBe(false);
    expect(verifyKieWebhook(taskId, ts, "", key)).toBe(false);
  });

  it("rejects mismatched-length signatures without throwing", () => {
    expect(verifyKieWebhook(taskId, ts, "short", key)).toBe(false);
  });
});

describe("verifyWebhookRequest", () => {
  const key = "test-hmac-key";
  const taskId = "task_abc";
  const ts = Math.floor(Date.now() / 1000).toString();

  function makeRequest(taskIdOverride?: string, tsOverride?: string, sigOverride?: string): Request {
    const body = JSON.stringify({
      code: 200,
      msg: "success",
      data: {
        task_id: taskIdOverride ?? taskId,
        state: "success",
        resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie.ai/img.jpg"] }),
        creditsConsumed: 8,
      },
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-webhook-timestamp": tsOverride ?? ts,
      "x-webhook-signature": sigOverride ?? sign(taskIdOverride ?? taskId, tsOverride ?? ts, key),
    };
    return new Request("https://app.example.com/api/webhooks/kie", {
      method: "POST",
      headers,
      body,
    });
  }

  it("verifies a legitimate webhook and extracts payload fields", async () => {
    process.env.KIE_WEBHOOK_HMAC_KEY = key;
    delete process.env.KIE_WEBHOOK_SECRET;
    // re-import not needed: env is read per call
    const res = await verifyWebhookRequest(makeRequest(), await makeRequest().clone().json());
    expect(res.ok).toBe(true);
    expect(res.payload?.taskId).toBe(taskId);
    expect(res.payload?.resultUrls).toEqual(["https://cdn.kie.ai/img.jpg"]);
    expect(res.payload?.creditsConsumed).toBe(8);
  });

  it("rejects a forged signature", async () => {
    process.env.KIE_WEBHOOK_HMAC_KEY = key;
    delete process.env.KIE_WEBHOOK_SECRET;
    const req = makeRequest(undefined, undefined, sign(taskId, ts, "wrong-key"));
    const res = await verifyWebhookRequest(req, await req.json());
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("signature");
  });

  it("rejects stale timestamps (replay guard)", async () => {
    process.env.KIE_WEBHOOK_HMAC_KEY = key;
    delete process.env.KIE_WEBHOOK_SECRET;
    const oldTs = Math.floor(Date.now() / 1000 - 3600).toString();
    const req = makeRequest(undefined, oldTs);
    const res = await verifyWebhookRequest(req, await req.json());
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("stale");
  });

  it("falls back to shared secret when no HMAC key is set", async () => {
    delete process.env.KIE_WEBHOOK_HMAC_KEY;
    process.env.KIE_WEBHOOK_SECRET = "shared-secret";
    const body = JSON.stringify({ data: { task_id: taskId } });
    const req = new Request("https://app.example.com/api/webhooks/kie", {
      method: "POST",
      headers: { "x-webhook-secret": "shared-secret" },
      body,
    });
    const res = await verifyWebhookRequest(req, JSON.parse(body));
    expect(res.ok).toBe(true);
  });

  it("rejects when neither key nor secret is configured", async () => {
    delete process.env.KIE_WEBHOOK_HMAC_KEY;
    delete process.env.KIE_WEBHOOK_SECRET;
    const body = JSON.stringify({ data: { task_id: taskId } });
    const req = new Request("https://app.example.com/api/webhooks/kie", {
      method: "POST",
      headers: {},
      body,
    });
    const res = await verifyWebhookRequest(req, JSON.parse(body));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("not configured");
  });
});
