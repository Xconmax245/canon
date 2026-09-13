import type { JobState } from "@/lib/types";
import type { GenerationStatus } from "@/lib/kie/types";

/**
 * Download state machine (section 11):
 *
 *   generating → success (KIE done, URL live)
 *                    → downloading (pulling to Supabase Storage)
 *                    → success + persisted asset
 *                    ↳ download_failed (retry the DOWNLOAD, not the generation)
 *
 * `fail` (KIE-side generation failure, costs credits to retry) is NEVER
 * conflated with `download_failed` (our storage step failed, free to retry
 * while the URL is still live).
 */

export type DownloadOutcome =
  | { kind: "persisted"; storageUrl: string }
  | { kind: "download_failed"; error: string };

export function nextJobStateAfterPersist(state: JobState): JobState {
  return "success";
}

export function shouldAttemptDownload(status: GenerationStatus): boolean {
  return status.state === "success" && Array.isArray(status.resultUrls) && status.resultUrls.length > 0;
}

export function pickPrimaryResultUrl(status: GenerationStatus): string | undefined {
  return status.resultUrls?.[0];
}

/**
 * Transition helper used by the job engine: given current job state and the
 * outcome of a download attempt, compute the next state.
 */
export function transitionAfterDownload(current: JobState, outcome: DownloadOutcome): JobState {
  if (outcome.kind === "persisted") return "success";
  if (current === "downloading" || current === "generating") return "download_failed";
  return current;
}
