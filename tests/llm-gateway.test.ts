import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callStructuredWithRetry, LlmValidationError, type LlmChatClient } from "@/lib/llm/gateway";

const schema = z.object({ name: z.string().min(2), age: z.number().int().min(0) });

const jsonSchema = { name: "test", schema: { type: "object" } as Record<string, unknown> };

function clientReturning(responses: string[]): LlmChatClient {
  let i = 0;
  return {
    async completeStructured() {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    },
  };
}

describe("callStructuredWithRetry", () => {
  it("returns validated data on first success", async () => {
    const client = clientReturning([JSON.stringify({ name: "Maya", age: 30 })]);
    const result = await callStructuredWithRetry(client, {
      system: "s",
      user: "u",
      jsonSchema,
      zodSchema: schema,
    });
    expect(result).toEqual({ name: "Maya", age: 30 });
  });

  it("retries with validation feedback when the first response is invalid", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ name: "M", age: 30 })) // name too short
      .mockResolvedValueOnce(JSON.stringify({ name: "Maya", age: 30 }));
    const client: LlmChatClient = { completeStructured: complete };

    const result = await callStructuredWithRetry(client, {
      system: "s",
      user: "u",
      jsonSchema,
      zodSchema: schema,
    });

    expect(result).toEqual({ name: "Maya", age: 30 });
    expect(complete).toHaveBeenCalledTimes(2);
    // Second call must include the validation errors as feedback.
    const secondMessages = complete.mock.calls[1][0] as { role: string; content: string }[];
    const feedbackMsg = secondMessages.find((m) => m.content.includes("failed validation"));
    expect(feedbackMsg).toBeTruthy();
    expect(feedbackMsg!.content).toContain("name");
  });

  it("throws LlmValidationError after exhausting attempts", async () => {
    const client = clientReturning([JSON.stringify({ name: "M", age: -1 })]);
    await expect(
      callStructuredWithRetry(client, {
        system: "s",
        user: "u",
        jsonSchema,
        zodSchema: schema,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(LlmValidationError);
  });

  it("tolerates ```json fences", async () => {
    const client = clientReturning(['```json\n{"name":"Maya","age":30}\n```']);
    const result = await callStructuredWithRetry(client, {
      system: "s",
      user: "u",
      jsonSchema,
      zodSchema: schema,
    });
    expect(result).toEqual({ name: "Maya", age: 30 });
  });

  it("retries on transport errors within the stage", async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new Error("502 bad gateway"))
      .mockResolvedValueOnce(JSON.stringify({ name: "Maya", age: 30 }));
    const client: LlmChatClient = { completeStructured: complete };

    const result = await callStructuredWithRetry(client, {
      system: "s",
      user: "u",
      jsonSchema,
      zodSchema: schema,
    });
    expect(result).toEqual({ name: "Maya", age: 30 });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
