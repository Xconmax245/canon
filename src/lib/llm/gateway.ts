import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * LLM gateway: runs a structured-output completion, validates with the given
 * Zod schema, and on validation failure retries ONLY this stage, feeding the
 * validation errors back into the prompt. Malformed data never flows onward.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredCallOptions<T> {
  /** System prompt describing the task. */
  system: string;
  /** User prompt containing the payload data. */
  user: string;
  /** JSON schema for OpenAI structured outputs. */
  jsonSchema: { name: string; schema: Record<string, unknown> };
  /** Zod schema used to validate the parsed response. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zodSchema: z.ZodType<T, any, any>;
  /** How many total attempts (first try + retries). Default 3. */
  maxAttempts?: number;
  /** Overrides the default model from env. */
  model?: string;
}

export interface LlmChatClient {
  /**
   * Single completion returning raw text content. Implemented by the
   * OpenAI provider using structured outputs (json_schema response format).
   */
  completeStructured(messages: LlmMessage[], jsonSchema: { name: string; schema: Record<string, unknown> }, model: string): Promise<string>;
}

export class LlmValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`LLM response failed schema validation: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

function zodIssuesToStrings(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

export async function callStructuredWithRetry<T>(
  client: LlmChatClient,
  opts: StructuredCallOptions<T>,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const model = opts.model;
  let feedback: string | undefined;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages: LlmMessage[] = [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ];
    if (feedback) {
      messages.push({
        role: "user",
        content:
          `Your previous response failed validation with these errors:\n${feedback}\n\n` +
          "Return a corrected response that satisfies the schema exactly. Fix ONLY the listed problems.",
      });
    }

    try {
      const raw = await client.completeStructured(messages, opts.jsonSchema, model!);
      const parsed = opts.zodSchema.safeParse(safeJsonParse(raw));
      if (parsed.success) {
        return parsed.data;
      }
      const issues = zodIssuesToStrings(parsed.error);
      lastError = new LlmValidationError(issues);
      logger.warn("llm.validation_retry", {
        schema: opts.jsonSchema.name,
        attempt,
        issues,
      });
      feedback = issues.join("\n");
    } catch (err) {
      // Transport/parse errors also retry within this stage only.
      lastError = err;
      logger.warn("llm.call_retry", {
        schema: opts.jsonSchema.name,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      feedback =
        feedback ??
        "Your previous response could not be parsed. Return only JSON matching the schema.";
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LLM stage "${opts.jsonSchema.name}" failed after ${maxAttempts} attempts`);
}

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  // Some models wrap JSON in ```json fences despite instructions; tolerate it.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error("Response was not valid JSON");
  }
}
