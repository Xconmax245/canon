import { describe, expect, it } from "vitest";
import {
  nextJobStateAfterPersist,
  pickPrimaryResultUrl,
  shouldAttemptDownload,
  transitionAfterDownload,
} from "@/lib/generation/downloader";
import { isActiveJobState, mapKieStateToJobState } from "@/lib/types";

describe("download decision helpers", () => {
  it("shouldAttemptDownload only when success with urls", () => {
    expect(
      shouldAttemptDownload({ state: "success", resultUrls: ["https://x/1.jpg"] }),
    ).toBe(true);
    expect(shouldAttemptDownload({ state: "success" })).toBe(false);
    expect(shouldAttemptDownload({ state: "success", resultUrls: [] })).toBe(false);
    expect(shouldAttemptDownload({ state: "generating" })).toBe(false);
  });

  it("pickPrimaryResultUrl takes the first url", () => {
    expect(pickPrimaryResultUrl({ state: "success", resultUrls: ["a", "b"] })).toBe("a");
    expect(pickPrimaryResultUrl({ state: "success" })).toBeUndefined();
  });

  it("transitionAfterDownload succeeds or fails appropriately", () => {
    expect(transitionAfterDownload("downloading", { kind: "persisted", storageUrl: "s3" })).toBe("success");
    expect(transitionAfterDownload("downloading", { kind: "download_failed", error: "e" })).toBe("download_failed");
    expect(transitionAfterDownload("generating", { kind: "download_failed", error: "e" })).toBe("download_failed");
  });

  it("nextJobStateAfterPersist is success", () => {
    expect(nextJobStateAfterPersist("downloading")).toBe("success");
  });
});

describe("state helpers", () => {
  it("active job states include downloading", () => {
    expect(isActiveJobState("downloading")).toBe(true);
    expect(isActiveJobState("waiting")).toBe(true);
    expect(isActiveJobState("success")).toBe(false);
    expect(isActiveJobState("fail")).toBe(false);
    expect(isActiveJobState("download_failed")).toBe(false);
  });

  it("KIE states map 1:1 to job states pre-download", () => {
    expect(mapKieStateToJobState("waiting")).toBe("waiting");
    expect(mapKieStateToJobState("queuing")).toBe("queuing");
    expect(mapKieStateToJobState("generating")).toBe("generating");
    expect(mapKieStateToJobState("success")).toBe("success");
    expect(mapKieStateToJobState("fail")).toBe("fail");
  });
});
