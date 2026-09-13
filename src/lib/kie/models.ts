/**
 * Single source of truth: lane → KIE model id.
 * Used by the prompt engine (prompt context) and the KIE client (dispatch).
 */
import type { GenerationLane } from "@/lib/kie/types";

export const KIE_LANE_MODELS: Record<GenerationLane, string> = {
  // flux1-kontext is KIE's documented, reliable text-to-image model.
  // (grok-imagine/text-to-image was tried first but currently fails with
  // KIE-side "Internal Error" on storyboard-length prompts.)
  "text-to-image": "flux1-kontext",
  "ideogram-character": "ideogram/character",
  "flux2-multi": "flux-2/pro-image-to-image",
};
