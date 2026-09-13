import { env, KIE_BASE_URL } from "@/lib/env";
import { logger } from "@/lib/logger";
import { KIE_LANE_MODELS } from "@/lib/kie/models";
import type {
  GenerationInput,
  GenerationLane,
  GenerationStatus,
  KieEnvelope,
  KieRecordInfo,
  KieResultJson,
} from "@/lib/kie/types";
import { KIE_SUCCESS_CODE } from "@/lib/kie/types";

/**
 * KIE adapter — the "renderer". KIE never sees the raw script and does no
 * story reasoning; it only receives finished prompts + reference image URLs.
 *
 * Endpoints (Market API):
 *   POST /api/v1/jobs/createTask   { model, callBackUrl, input }
 *   GET  /api/v1/jobs/recordInfo?taskId=...
 */

type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";
const ACTIVE_STATES: KieTaskState[] = ["waiting", "queuing", "generating"];

async function kieFetch<T>(path: string, init?: RequestInit): Promise<KieEnvelope<T>> {
  const res = await fetch(`${KIE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.kie.apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  let body: KieEnvelope<T>;
  try {
    body = (await res.json()) as KieEnvelope<T>;
  } catch {
    throw new Error(`KIE returned non-JSON response (HTTP ${res.status}) for ${path}`);
  }

  if (body.code !== KIE_SUCCESS_CODE) {
    // Map known codes to actionable errors; never leak raw payloads upward.
    if (body.code === 402) throw new Error("KIE insufficient credits");
    if (body.code === 429) throw new Error("KIE rate limited");
    throw new Error(`KIE error ${body.code}: ${body.msg || "unknown error"}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Lane → input mapping (model ids live in kie/models.ts)
// ---------------------------------------------------------------------------

function buildLaneInput(lane: GenerationLane, input: GenerationInput): Record<string, unknown> {
  switch (lane) {
    case "text-to-image": {
      // grok-imagine/text-to-image: minimal documented input shape.
      const body: Record<string, unknown> = {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "16:9",
      };
      return body;
    }
    case "ideogram-character": {
      // ideogram/character accepts exactly 1 reference image; extras are
      // ignored by the provider, but we send only one to keep requests clean.
      const refs = (input.referenceImageUrls ?? []).slice(0, 1);
      const body: Record<string, unknown> = {
        prompt: input.prompt.slice(0, 5000), // ideogram max prompt length
        reference_image_urls: refs,
        rendering_speed: "BALANCED",
        style: "AUTO",
        expand_prompt: false, // our prompt is already engineered; don't let MagicPrompt rewrite it
        num_images: "1",
      };
      if (input.negativePrompt) body.negative_prompt = input.negativePrompt.slice(0, 500);
      if (input.seed !== undefined) body.seed = input.seed;
      return body;
    }
    case "flux2-multi": {
      const refs = (input.referenceImageUrls ?? []).slice(0, 8); // flux2 supports up to 8
      const body: Record<string, unknown> = {
        prompt: input.prompt,
        input_urls: refs,
        aspect_ratio: input.aspectRatio ?? "16:9",
        resolution: "1K",
      };
      if (input.seed !== undefined) body.seed = input.seed;
      return body;
    }
  }
}

// ---------------------------------------------------------------------------
// Public adapter API
// ---------------------------------------------------------------------------

export interface CreateTaskArgs {
  lane: GenerationLane;
  input: GenerationInput;
  callBackUrl?: string;
}

export async function createTask(args: CreateTaskArgs): Promise<{ taskId: string }> {
  const model = KIE_LANE_MODELS[args.lane];
  const payload = {
    model,
    ...(args.callBackUrl ? { callBackUrl: args.callBackUrl } : {}),
    input: buildLaneInput(args.lane, args.input),
  };

  logger.info("kie.createTask", { lane: args.lane, model });
  const res = await kieFetch<KieCreateTaskDataLike>("/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.data?.taskId) throw new Error("KIE createTask returned no taskId");
  return { taskId: res.data.taskId };
}

interface KieCreateTaskDataLike {
  taskId: string;
}

function parseResultJson(raw: string | undefined): KieResultJson {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as KieResultJson;
  } catch {
    logger.warn("kie.resultJson_unparseable", { raw: raw.slice(0, 200) });
    return {};
  }
}

export async function getStatus(taskId: string): Promise<GenerationStatus> {
  const res = await kieFetch<KieRecordInfo>(
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
  );
  const rec = res.data;
  if (!rec) throw new Error("KIE recordInfo returned no data");

  const state = normalizeState(rec.state);
  const result = parseResultJson(rec.resultJson);

  return {
    state,
    resultUrls: result.resultUrls,
    creditsConsumed: rec.creditsConsumed,
    failMsg: rec.failMsg || undefined,
  };
}

function normalizeState(raw: string): KieTaskState {
  if ((ACTIVE_STATES as string[]).includes(raw)) return raw as KieTaskState;
  if (raw === "success" || raw === "fail") return raw;
  logger.warn("kie.unknown_state", { raw });
  return "generating"; // safest active assumption; reconciliation will correct
}

export function buildCallBackUrl(): string {
  const base = env.app.baseUrl().replace(/\/+$/, "");
  return `${base}/api/webhooks/kie`;
}
