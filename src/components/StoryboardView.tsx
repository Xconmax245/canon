"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Images } from "lucide-react";
import {
  getStoryboard,
  type Storyboard,
  type StoryboardScene,
} from "@/lib/api-client";
import { SceneCard } from "@/components/SceneCard";
import { generateProject } from "@/lib/api-client";

interface StoryboardViewProps {
  projectId: string;
  onStartOver: () => void;
  onResumeGeneration?: () => void;
}

export function StoryboardView({ projectId, onStartOver, onResumeGeneration }: StoryboardViewProps) {
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingGeneration, setStartingGeneration] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      const data = await getStoryboard(projectId);
      setStoryboard(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load storyboard");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const handleSceneUpdate = useCallback((updated: StoryboardScene) => {
    setStoryboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === updated.id ? updated : s)),
      };
    });
  }, []);

  const imagesUsed = storyboard?.imagesUsed;
  const generationLimit = storyboard?.generationLimit;
  const sceneCount = storyboard?.scenes.length ?? 0;
  
  const hasWaitingScenes = storyboard?.scenes.some((s) => s.status === "waiting");
  const hasGeneratingScenes = storyboard?.scenes.some(
    (s) => s.status === "queuing" || s.status === "generating" || s.status === "downloading"
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      await fetchBoard();
      if (!cancelled) {
        timer = setTimeout(poll, 3000);
      }
    }

    if (hasGeneratingScenes) {
      timer = setTimeout(poll, 3000);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasGeneratingScenes, fetchBoard]);

  useEffect(() => {
    if (!hasGeneratingScenes) return;
    const id = setInterval(() => {
      fetch("/api/internal/reconcile", { method: "POST" }).catch(() => {});
    }, 60_000);
    const initial = setTimeout(() => {
      fetch("/api/internal/reconcile", { method: "POST" }).catch(() => {});
    }, 20_000);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, [hasGeneratingScenes]);

  async function handleStartGeneration() {
    if (startingGeneration) return;
    setStartingGeneration(true);
    try {
      await generateProject(projectId);
      onResumeGeneration?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setStartingGeneration(false);
    }
  }

  return (
    <div className="min-h-dvh px-5 py-8">
      {/* Header bar */}
      <header
        className="mx-auto mb-8 flex max-w-6xl items-center gap-4"
        data-aos="fade-down"
      >
        <button
          onClick={onStartOver}
          className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
          style={{
            borderColor: "var(--surface-border)",
            color: "var(--text-muted)",
            background: "var(--surface)",
          }}
        >
          <ArrowLeft size={13} strokeWidth={2} />
          New project
        </button>

        <div className="flex flex-1 items-center gap-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--accent-primary)" }}
          >
            Canon
          </p>
          {!loading && storyboard && (
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              — {sceneCount} scene{sceneCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Generate missing images button */}
        {!loading && storyboard && hasWaitingScenes && (
          <button
            onClick={handleStartGeneration}
            disabled={startingGeneration}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent-primary)" }}
          >
            {startingGeneration ? "Starting..." : "Start Generation"}
          </button>
        )}

        {/* Budget indicator */}
        {imagesUsed !== undefined && generationLimit !== undefined && (
          <div className="flex items-center gap-1.5 ml-2">
            <Images size={13} strokeWidth={1.75} style={{ color: "var(--text-muted)" }} />
            <span
              className="font-mono-num text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              {imagesUsed} / {generationLimit}
            </span>
          </div>
        )}
      </header>

      {/* Signature gradient bar */}
      <div className="mx-auto mb-8 max-w-6xl" data-aos="fade-in" data-aos-delay="100">
        <div className="h-[2px] w-full rounded-full gradient-bar opacity-60" />
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-6xl">
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="mx-auto max-w-sm rounded-2xl border border-red-200 bg-red-50 px-6 py-6 text-center" data-aos="fade-in">
            <p className="mb-3 text-sm text-red-700">{error}</p>
            <button
              onClick={fetchBoard}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {storyboard && !loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {storyboard.scenes
              .sort((a, b) => a.order - b.order)
              .map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onUpdate={handleSceneUpdate}
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--surface-border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div className="skeleton aspect-video w-full" />
      <div className="p-4 pt-3">
        <div className="skeleton mb-3 h-2.5 w-12 rounded-full" />
        <div className="skeleton mb-1.5 h-2.5 w-full rounded-full" />
        <div className="skeleton h-2.5 w-3/4 rounded-full" />
      </div>
    </div>
  );
}
