import { z } from "zod";

// ---------------------------------------------------------------------------
// Identity lock — computed at scene-planning time, drives the model router.
// ---------------------------------------------------------------------------

export type IdentityLockRequirement = "none" | "single" | "multi";

export function computeIdentityLock(characterCount: number): IdentityLockRequirement {
  if (characterCount === 0) return "none";
  if (characterCount === 1) return "single";
  return "multi";
}

// ---------------------------------------------------------------------------
// Story Bible
// ---------------------------------------------------------------------------

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  canonicalDescription: z.string().min(1),
  referenceImageUrls: z.array(z.string().url()).default([]),
});

export const characterStateSchema = z.object({
  characterId: z.string().min(1),
  sceneId: z.string().min(1),
  changes: z.string().default(""),
});

export const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  canonicalDescription: z.string().min(1),
  referenceImageUrls: z.array(z.string().url()).default([]),
});

export const storyBibleSchema = z.object({
  title: z.string().default("Untitled"),
  logline: z.string().default(""),
  genre: z.string().default(""),
  tone: z.string().default(""),
  visualMotifs: z.array(z.string()).default([]),
  characters: z.array(characterSchema).default([]),
  locations: z.array(locationSchema).default([]),
  characterStates: z.array(characterStateSchema).default([]),
});

export type Character = z.infer<typeof characterSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type Location = z.infer<typeof locationSchema>;
export type StoryBible = z.infer<typeof storyBibleSchema>;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const identityLockSchema = z.enum(["none", "single", "multi"]);

export const plannedSceneSchema = z.object({
  order: z.number().int().min(1),
  scriptExcerpt: z.string().min(1),
  characterIds: z.array(z.string()).default([]),
  locationId: z.string().optional(),
  action: z.string().min(1),
  emotion: z.string().optional(),
  composition: z.string().default(""),
  continuityNotes: z.string().default(""),
});

export type PlannedScene = z.infer<typeof plannedSceneSchema>;

export type SceneStatus =
  | "waiting"
  | "queuing"
  | "generating"
  | "downloading"
  | "success"
  | "fail"
  | "download_failed";

export type PromptSource = "auto" | "user-edited";

export type ProviderLaneName = "text-to-image" | "ideogram-character" | "flux2-multi";

// ---------------------------------------------------------------------------
// Visual style directive presets
// ---------------------------------------------------------------------------

export const STYLE_PRESETS = [
  "cinematic",
  "anime",
  "comic",
  "photorealistic",
  "fantasy",
  "horror",
  "illustration",
] as const;

export type StylePreset = (typeof STYLE_PRESETS)[number];

export function isStylePreset(v: string): v is StylePreset {
  return (STYLE_PRESETS as readonly string[]).includes(v);
}

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;

export function isAspectRatio(v: string): boolean {
  return (ASPECT_RATIOS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Job / generation types (mirror prisma enums; declared here so services can
// work with plain types and the KIE adapter stays prisma-free).
// ---------------------------------------------------------------------------

export type JobState =
  | "waiting"
  | "queuing"
  | "generating"
  | "downloading"
  | "success"
  | "fail"
  | "download_failed";

export type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

/** KIE's actual states — do not invent your own. */
export const KIE_TASK_STATES: readonly KieTaskState[] = [
  "waiting",
  "queuing",
  "generating",
  "success",
  "fail",
];

/** Job states that mean "work still in flight; never duplicate a KIE task for these". */
export const ACTIVE_JOB_STATES: readonly JobState[] = [
  "waiting",
  "queuing",
  "generating",
  "downloading",
];

export function isActiveJobState(s: JobState): boolean {
  return (ACTIVE_JOB_STATES as readonly string[]).includes(s);
}

export function mapKieStateToJobState(state: KieTaskState): JobState {
  return state; // identical vocabulary for the pre-download states
}
