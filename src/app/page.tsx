"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { CreateView } from "@/components/CreateView";
import { ProgressView } from "@/components/ProgressView";
import { StoryboardView } from "@/components/StoryboardView";
import {
  createProject,
  analyzeProject,
  planScenes,
  generateProject,
} from "@/lib/api-client";

type AppStage = "create" | "creating" | "progress" | "storyboard";

export default function Home() {
  const [stage, setStage] = useState<AppStage>("create");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(
    async (script: string, styleDirective: string) => {
      setError(null);
      // Show interstitial immediately — before the first API call lands
      setStage("creating");
      try {
        const project = await createProject({
          script,
          visualStyleDirective: styleDirective,
        });
        // Switch to progress only once we have a real project ID
        setProjectId(project.id);
        setStage("progress");
        await analyzeProject(project.id);
        await planScenes(project.id);
        await generateProject(project.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        setStage("create");
      }
    },
    []
  );

  const handleProgressComplete = useCallback(() => {
    setStage("storyboard");
  }, []);

  const handleStartOver = useCallback(() => {
    setProjectId(null);
    setStage("create");
    setError(null);
  }, []);

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg-gradient)", backgroundAttachment: "fixed" }}>
      {stage === "create" && (
        <CreateView onGenerate={handleGenerate} initialError={error} />
      )}

      {/* Interstitial: createProject API call in flight */}
      {stage === "creating" && (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4" data-aos="fade-in">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--accent-primary-soft)" }}
          >
            <Loader2 size={26} strokeWidth={1.75} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Starting your project…
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Hang tight while we set things up
            </p>
          </div>
        </div>
      )}

      {stage === "progress" && projectId && (
        <ProgressView
          projectId={projectId}
          onComplete={handleProgressComplete}
        />
      )}
      {stage === "storyboard" && projectId && (
        <StoryboardView projectId={projectId} onStartOver={handleStartOver} />
      )}
    </div>
  );
}
