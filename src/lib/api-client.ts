// ---------------------------------------------------------------------------
// Typed API client — builds against the contract in the spec
// All functions throw on non-2xx responses.
// ---------------------------------------------------------------------------

export type SceneStatus =
  | "waiting"
  | "queuing"
  | "generating"
  | "downloading"
  | "success"
  | "fail"
  | "download_failed";

export type PromptSource = "auto" | "user-edited";

// --- Request / Response shapes ---

export interface CreateProjectResponse {
  id: string;
  status: string;
  visualStyleDirective: string;
  aspectRatio: string;
  generationLimit: number;
  createdAt: string;
}

export interface StatusScene {
  id: string;
  order: number;
  status: SceneStatus;
}

export interface ProjectStatus {
  projectId: string;
  status: string;
  analysisError: string | null;
  analysis: {
    storyBibleReady: boolean;
  } | null;
  planning: {
    sceneCount: number;
  } | null;
  generation: {
    totalScenes: number;
    succeeded: number;
    failed: number;
    activeJobs: number;
    allDone: boolean;
  } | null;
  budget: {
    generationLimit: number;
    imagesGenerated: number;
    creditsConsumed: number;
    remaining: number;
  } | null;
  scenes: StatusScene[];
}

export interface StoryboardScene {
  id: string;
  order: number;
  scriptExcerpt: string;
  imageUrl: string | null;
  status: SceneStatus;
  prompt: string;
  promptSource: PromptSource;
}

export interface Storyboard {
  scenes: StoryboardScene[];
  generationLimit?: number;
  imagesUsed?: number;
}

// --- Helpers ---

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// --- API calls ---

export async function createProject(payload: {
  script: string;
  visualStyleDirective: string;
  aspectRatio?: string;
}): Promise<CreateProjectResponse> {
  return apiFetch<CreateProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ aspectRatio: "16:9", ...payload }),
  });
}

export async function analyzeProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}/analyze`, { method: "POST" });
}

export async function planScenes(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}/plan-scenes`, { method: "POST" });
}

export async function generateProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}/generate`, { method: "POST" });
}

export async function getProjectStatus(id: string): Promise<ProjectStatus> {
  return apiFetch<ProjectStatus>(`/api/projects/${id}/status`);
}

export async function getStoryboard(id: string): Promise<Storyboard> {
  return apiFetch<Storyboard>(`/api/projects/${id}/storyboard`);
}

export async function patchScenePrompt(
  sceneId: string,
  prompt: string
): Promise<void> {
  await apiFetch(`/api/scenes/${sceneId}/prompt`, {
    method: "PATCH",
    body: JSON.stringify({ prompt }),
  });
}

export async function regeneratePrompt(sceneId: string): Promise<void> {
  await apiFetch(`/api/scenes/${sceneId}/regenerate-prompt`, {
    method: "POST",
  });
}

export async function regenerateScene(sceneId: string): Promise<void> {
  await apiFetch(`/api/scenes/${sceneId}/regenerate`, { method: "POST" });
}

// --- State helpers ---

const TERMINAL: Set<SceneStatus> = new Set([
  "success",
  "fail",
  "download_failed",
]);

export function isTerminal(status: SceneStatus): boolean {
  return TERMINAL.has(status);
}

export function isActive(status: SceneStatus): boolean {
  return !TERMINAL.has(status);
}

export function isFailed(status: SceneStatus): boolean {
  return status === "fail" || status === "download_failed";
}
