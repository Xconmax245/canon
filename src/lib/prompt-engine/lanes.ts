import type { StoryBible } from "@/lib/types";

/**
 * Three small, independently testable prompt builders — one per lane.
 * Each assembles the full context block (style, canonical identity, current
 * state, location, action/emotion, composition, continuity) shaped for its
 * image lane. The final natural-language prompt itself comes from the LLM
 * (stage 3); these builders produce the deterministic parts that wrap it.
 */

export interface PromptBuildContext {
  styleDirective: string;
  aspectRatio: string;
  /** Deterministic identity/state/context block derived from the Story Bible. */
  identityBlock: string;
  /** The LLM-generated narrative prompt (stage 3 output). */
  narrative: string;
  /** KIE model id for this lane. */
  model: string;
}

export interface BuiltPrompt {
  /** Final text prompt sent to KIE. */
  prompt: string;
  negativePrompt: string;
  model: string;
}

const SHARED_NEGATIVE =
  "text, watermark, signature, logo, extra limbs, deformed hands, blurry, low quality, jpeg artifacts, cropped";

// flux1-kontext enforces a 1024-char prompt cap (rejects with a generic
// 500 otherwise). Stay safely under by trimming at a word boundary.
const MAX_PROMPT_CHARS = 1000;

function cap(text: string): string {
  if (text.length <= MAX_PROMPT_CHARS) return text;
  const cut = text.slice(0, MAX_PROMPT_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_PROMPT_CHARS * 0.7 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function compose(ctx: PromptBuildContext, lanePrefix: string): string {
  return cap(
    `${lanePrefix} ${ctx.narrative.trim()} ${ctx.identityBlock} Style: ${ctx.styleDirective.trim()}.`
      .replace(/\s+/g, " ")
      .trim(),
  );
}

// ---------------------------------------------------------------------------
// Lane 1: text-to-image (no character identity lock)
// ---------------------------------------------------------------------------

export function buildTextToImagePrompt(ctx: PromptBuildContext): BuiltPrompt {
  return {
    prompt: compose(ctx, ""),
    negativePrompt: SHARED_NEGATIVE,
    model: ctx.model,
  };
}

// ---------------------------------------------------------------------------
// Lane 2: ideogram-character (exactly ONE reference image is used)
// ---------------------------------------------------------------------------

export function buildIdeogramCharacterPrompt(ctx: PromptBuildContext): BuiltPrompt {
  const prefix =
    "Render the referenced character with unchanged facial identity and features. ";
  return {
    prompt: compose(ctx, prefix),
    negativePrompt: `${SHARED_NEGATIVE}, altered face, different person, face swap artifacts`,
    model: ctx.model,
  };
}

// ---------------------------------------------------------------------------
// Lane 3: flux2-multi (up to 8 reference images)
// ---------------------------------------------------------------------------

export function buildFlux2MultiPrompt(
  ctx: PromptBuildContext & { referenceCount: number },
): BuiltPrompt {
  const prefix =
    ctx.referenceCount > 0
      ? `Keep every referenced subject visually consistent with the provided ${ctx.referenceCount} reference images. `
      : "";
  return {
    prompt: compose(ctx, prefix),
    negativePrompt: SHARED_NEGATIVE,
    model: ctx.model,
  };
}
