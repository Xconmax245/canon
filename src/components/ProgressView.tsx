"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Users,
  MapPin,
  Clapperboard,
  RefreshCw,
  ImageOff,
  Clock,
  Coins,
  type LucideIcon,
} from "lucide-react";
import {
  getProjectStatus,
  isFailed,
  isTerminal,
  stopProject,
  type ProjectStatus,
  type SceneStatus,
} from "@/lib/api-client";

interface ProgressViewProps {
  projectId: string;
  onComplete: () => void;
  onStop?: () => void;
}

const POLL_INTERVAL_MS = 3000;

export function ProgressView({ projectId, onComplete, onStop }: ProgressViewProps) {
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      try {
        const data = await getProjectStatus(projectId);
        if (cancelled) return;
        setStatus(data);

        // Use backend's authoritative allDone flag, or fall back to scene statuses
        const allDone =
          data.generation?.allDone ||
          (data.scenes.length > 0 && data.scenes.every((s) => isTerminal(s.status)));

        if (allDone && !doneRef.current) {
          doneRef.current = true;
          setTimeout(() => {
            if (!cancelled) onComplete();
          }, 900);
          return;
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Polling error");
        timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, onComplete]);

  // Trigger reconciler periodically. In dev this is the primary mechanism (since webhooks
  // can't reach localhost). In production, this acts as a robust fallback if KIE
  // webhooks are dropped or misconfigured (e.g. wrong APP_BASE_URL).
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/internal/reconcile", { method: "POST" }).catch(() => {});
    }, 60_000);
    // Also fire once immediately after 20s to unstick any jobs quickly
    const initial = setTimeout(() => {
      fetch("/api/internal/reconcile", { method: "POST" }).catch(() => {});
    }, 20_000);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, []);

  const handleStop = async () => {
    try {
      await stopProject(projectId);
    } catch (e) {
      console.error("Failed to stop project via API", e);
    }
    if (onStop) onStop();
  };

  const scenesDone =
    status?.generation?.succeeded ?? status?.scenes.filter((s) => isTerminal(s.status)).length ?? 0;
  const scenesTotal = status?.planning?.sceneCount ?? status?.scenes.length ?? 0;
  const progress = scenesTotal > 0 ? scenesDone / scenesTotal : 0;

  const storyAnalyzed = status?.analysis?.storyBibleReady === true;
  const hasScenes = (status?.planning?.sceneCount ?? 0) > 0;
  const hasGenerationStarted = (status?.scenes.length ?? 0) > 0;
  const budget = status?.budget;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-20">
      {/* Orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          style={{
            position: "absolute",
            top: "-5%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 560,
            height: 420,
            background:
              "radial-gradient(ellipse 60% 55% at 50% 20%, rgba(139,111,232,0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Header */}
        <div className="mb-8 text-center" data-aos="fade-down">
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--accent-primary)" }}
          >
            Canon
          </p>
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {hasGenerationStarted ? "Generating visuals…" : storyAnalyzed ? "Planning scenes…" : "Reading your script…"}
          </h2>
          {hasGenerationStarted && (
            <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
              This usually takes a minute or two
            </p>
          )}
        </div>

        {/* Progress bar */}
        {hasGenerationStarted && (
          <div
            className="mb-7 overflow-hidden rounded-full"
            style={{ height: 3, background: "var(--surface-border)" }}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full gradient-bar transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progress * 100, 4)}%` }}
            />
          </div>
        )}

        {/* Analysis card */}
        <div
          className="mb-4 overflow-hidden rounded-2xl border"
          data-aos="fade-up"
          data-aos-delay="100"
          style={{
            background: "var(--surface)",
            borderColor: "var(--surface-border)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
          }}
        >
          <div className="px-5 py-4">
            <StepRow
              done={storyAnalyzed}
              loading={!storyAnalyzed}
              icon={Clapperboard}
              label={storyAnalyzed ? "Story analyzed" : "Analyzing story…"}
            />
            <StepRow
              done={hasScenes}
              loading={storyAnalyzed && !hasScenes}
              icon={MapPin}
              label={
                hasScenes
                  ? `${status!.planning!.sceneCount} scenes planned`
                  : "Planning scenes…"
              }
            />
            <StepRow
              done={hasGenerationStarted}
              loading={hasScenes && !hasGenerationStarted}
              icon={Users}
              label={hasGenerationStarted ? "Generating images" : "Queuing image generation…"}
              last
            />
          </div>
        </div>

        {/* Scene grid */}
        {hasGenerationStarted && status && (
          <div
            className="overflow-hidden rounded-2xl border"
            data-aos="fade-up"
            data-aos-delay="200"
            style={{
              background: "var(--surface)",
              borderColor: "var(--surface-border)",
              boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
            }}
          >
            <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--surface-border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                Generating images
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 p-5 sm:grid-cols-6">
              {status.scenes.map((scene) => (
                <ScenePill key={scene.id} order={scene.order} status={scene.status} />
              ))}
            </div>
            {scenesTotal > 0 && (
              <div className="border-t px-5 py-3 flex items-center justify-between" style={{ borderColor: "var(--surface-border)" }}>
                <p className="font-mono-num text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {scenesDone} of {scenesTotal} complete
                </p>
                {status?.budget && (
                  <p className="font-mono-num text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {status.budget.imagesGenerated} / {status.budget.generationLimit} budget
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-[13px] text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}

function StepRow({
  done,
  loading,
  icon: Icon,
  label,
  last = false,
}: {
  done: boolean;
  loading: boolean;
  icon: LucideIcon;
  label: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-2.5 ${!last ? "border-b" : ""}`} style={{ borderColor: "var(--surface-border)" }}>
      {/* Icon container */}
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={{
          background: done
            ? "var(--accent-primary-soft)"
            : loading
            ? "rgba(0,0,0,0.04)"
            : "rgba(0,0,0,0.04)",
        }}
      >
        {done ? (
          <Check size={13} strokeWidth={2.5} style={{ color: "var(--accent-primary)" }} />
        ) : loading ? (
          <RefreshCw size={13} strokeWidth={2} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        ) : (
          <Icon size={13} strokeWidth={1.75} style={{ color: "var(--text-muted)" }} />
        )}
      </span>

      <span
        className="text-[13px]"
        style={{
          color: done ? "var(--text-primary)" : "var(--text-muted)",
          fontWeight: done ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function ScenePill({
  order,
  status,
}: {
  order: number;
  status: SceneStatus;
}) {
  const isDone = isTerminal(status);
  const isActive = status === "generating" || status === "downloading" || status === "queuing";
  const isFail = status === "fail" || status === "download_failed";

  return (
    <div
      className="flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-mono-num transition-all"
      style={{
        background: isDone
          ? isFail
            ? "rgba(239,68,68,0.06)"
            : "var(--accent-primary-soft)"
          : isActive
          ? "rgba(139,111,232,0.06)"
          : "rgba(0,0,0,0.03)",
        border: `1px solid ${
          isDone
            ? isFail
              ? "rgba(239,68,68,0.12)"
              : "rgba(139,111,232,0.18)"
            : isActive
            ? "rgba(139,111,232,0.1)"
            : "var(--surface-border)"
        }`,
      }}
    >
      {isFail ? (
        <ImageOff size={11} strokeWidth={2} style={{ color: "#EF4444" }} />
      ) : isDone ? (
        <Check size={11} strokeWidth={2.5} style={{ color: "var(--accent-primary)" }} />
      ) : isActive ? (
        <RefreshCw size={10} strokeWidth={2} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
      ) : (
        <Clock size={10} strokeWidth={1.75} style={{ color: "var(--text-muted)" }} />
      )}
      <span
        style={{
          color: isDone
            ? isFail ? "#EF4444" : "var(--accent-primary)"
            : isActive
            ? "var(--text-primary)"
            : "var(--text-muted)",
        }}
      >
        {String(order).padStart(2, "0")}
      </span>
    </div>
  );
}
