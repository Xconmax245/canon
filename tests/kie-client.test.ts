import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The KIE client is tested with a mocked global fetch — no real API calls.
 * We assert the wire format matches KIE's Market API:
 *   POST /api/v1/jobs/createTask  { model, callBackUrl?, input }
 *   GET  /api/v1/jobs/recordInfo?taskId=...
 */

process.env.KIE_API_KEY = "test-kie-key";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okEnvelope(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ code: 200, msg: "success", data }) };
}

afterEach(() => {
  fetchMock.mockClear();
});

describe("KIE client", () => {
  it("createTask sends model + input in Market API format", async () => {
    const { createTask } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce(okEnvelope({ taskId: "task_1" }));

    const res = await createTask({
      lane: "flux2-multi",
      input: {
        prompt: "A rainy rooftop chase",
        referenceImageUrls: ["https://img/1.png", "https://img/2.png"],
        aspectRatio: "16:9",
      },
    });

    expect(res.taskId).toBe("task_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://api.kie.ai/api/v1/jobs/createTask");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-kie-key");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("flux-2/pro-image-to-image");
    expect(body.input.prompt).toBe("A rainy rooftop chase");
    expect(body.input.input_urls).toEqual(["https://img/1.png", "https://img/2.png"]);
    expect(body.input.aspect_ratio).toBe("16:9");
  });

  it("ideogram-character lane sends exactly one reference and ideogram options", async () => {
    const { createTask } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce(okEnvelope({ taskId: "task_2" }));

    await createTask({
      lane: "ideogram-character",
      input: {
        prompt: "p".repeat(6000),
        referenceImageUrls: ["https://img/a.png", "https://img/b.png", "https://img/c.png"],
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("ideogram/character");
    expect(body.input.reference_image_urls).toHaveLength(1); // extras ignored provider-side; we send one
    expect(body.input.prompt.length).toBeLessThanOrEqual(5000); // ideogram prompt cap
    expect(body.input.expand_prompt).toBe(false); // our prompt is pre-engineered
  });

  it("text-to-image lane maps negative prompt and aspect ratio", async () => {
    const { createTask } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce(okEnvelope({ taskId: "task_3" }));

    await createTask({
      lane: "text-to-image",
      input: { prompt: "a lighthouse", aspectRatio: "9:16", negativePrompt: "text" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("flux1-kontext");
    expect(body.input.aspect_ratio).toBe("9:16");
  });

  it("throws a sanitized error on non-200 envelope codes", async () => {
    const { createTask } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 402, msg: "Insufficient Credits" }),
    });
    await expect(createTask({ lane: "text-to-image", input: { prompt: "x" } })).rejects.toThrow(
      /insufficient credits/i,
    );
  });

  it("getStatus parses resultJson string and normalizes state", async () => {
    const { getStatus } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce(
      okEnvelope({
        taskId: "task_9",
        state: "success",
        resultJson: JSON.stringify({ resultUrls: ["https://cdn/out.jpg"] }),
        creditsConsumed: 12,
      }),
    );

    const status = await getStatus("task_9");
    expect(status.state).toBe("success");
    expect(status.resultUrls).toEqual(["https://cdn/out.jpg"]);
    expect(status.creditsConsumed).toBe(12);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/jobs/recordInfo?taskId=task_9");
  });

  it("normalizes unknown states to generating", async () => {
    const { getStatus } = await import("@/lib/kie/client");
    fetchMock.mockResolvedValueOnce(okEnvelope({ taskId: "t", state: "weird_state" }));
    const status = await getStatus("t");
    expect(status.state).toBe("generating");
  });
});
