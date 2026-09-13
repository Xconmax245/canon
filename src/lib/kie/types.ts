/**
 * Envelope shared by every KIE Market API response:
 *   { code, msg, data }
 * code 200 means success. All other codes are errors — the human-readable
 * reason is in `msg`. We never persist or expose raw provider payloads.
 */
export const KIE_SUCCESS_CODE = 200;

export interface KieEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
}

export interface KieCreateTaskData {
  taskId: string;
}

/**
 * recordInfo payload. `param` and `resultJson` are JSON *strings* on the wire.
 */
export interface KieRecordInfo {
  taskId: string;
  model?: string;
  state: string;
  param?: string;
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  costTime?: number;
  completeTime?: number;
  createTime?: number;
  updateTime?: number;
  progress?: number;
  creditsConsumed?: number;
}

export interface KieResultJson {
  resultUrls?: string[];
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Webhook payload (POSTed to our callBackUrl when a task completes)
// ---------------------------------------------------------------------------

export interface KieWebhookBody {
  code: number;
  msg: string;
  data: {
    task_id?: string;
    taskId?: string;
    callbackType?: string;
    state?: string;
    resultJson?: string;
    creditsConsumed?: number;
    failMsg?: string;
    [k: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Provider-facing types (section 10 of the directive)
// ---------------------------------------------------------------------------

export interface GenerationInput {
  prompt: string;
  /** 1 for ideogram/character (extras ignored), up to 8 for flux2 */
  referenceImageUrls?: string[];
  negativePrompt?: string;
  aspectRatio?: string;
  seed?: number;
}

export type GenerationLane = "text-to-image" | "ideogram-character" | "flux2-multi";

export interface GenerationStatus {
  state: "waiting" | "queuing" | "generating" | "success" | "fail";
  resultUrls?: string[];
  creditsConsumed?: number;
  failMsg?: string;
}

export interface ImageGenerationProvider {
  generateImage(input: GenerationInput & { lane: GenerationLane }): Promise<{ taskId: string }>;
  getStatus(taskId: string): Promise<GenerationStatus>;
}
