"use client";

import { useState, useRef, useEffect } from "react";
import {
  RefreshCw,
  ChevronDown,
  Check,
  RotateCcw,
  AlertTriangle,
  Loader2,
  ImageOff,
  Download,
} from "lucide-react";
import {
  patchScenePrompt,
  regeneratePrompt,
  regenerateScene,
  isFailed,
  isTerminal,
  type StoryboardScene,
} from "@/lib/api-client";

interface SceneCardProps {
  scene: StoryboardScene;
  onUpdate: (updated: StoryboardScene) => void;
}

export function SceneCard({ scene, onUpdate }: SceneCardProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(scene.prompt);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPromptDraft(scene.prompt);
  }, [scene.prompt]);

  useEffect(() => {
    if (promptOpen && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [promptOpen, promptDraft]);

  const failed = isFailed(scene.status);
  const terminal = isTerminal(scene.status);
  const showImage = scene.status === "success" && scene.imageUrl;
  const showGenerating =
    scene.status === "generating" ||
    scene.status === "downloading" ||
    scene.status === "queuing";

  async function handleSavePrompt() {
    if (saving) return;
    setSaving(true);
    setCardError(null);
    try {
      await patchScenePrompt(scene.id, promptDraft);
      onUpdate({ ...scene, prompt: promptDraft, promptSource: "user-edited" });
      setPromptOpen(false);
    } catch (err: unknown) {
      setCardError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPrompt() {
    if (resetting) return;
    setResetting(true);
    setCardError(null);
    try {
      await regeneratePrompt(scene.id);
      onUpdate({ ...scene, promptSource: "auto" });
      setPromptOpen(false);
    } catch (err: unknown) {
      setCardError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setCardError(null);
    try {
      await regenerateScene(scene.id);
      onUpdate({ ...scene, status: "queuing", imageUrl: null });
    } catch (err: unknown) {
      setCardError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDownload() {
    if (!scene.imageUrl) return;
    try {
      // Try to fetch as blob to force download
      const res = await fetch(scene.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scene-${String(scene.order).padStart(2, "0")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
      window.open(scene.imageUrl, "_blank"); // Fallback
    }
  }

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border transition-shadow duration-200 hover:shadow-[0_6px_28px_rgba(139,111,232,0.13)]"
      data-aos="fade-up"
      data-aos-delay={(scene.order % 10) * 50}
      style={{
        background: "var(--surface)",
        borderColor: "var(--surface-border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Image area */}
      <div className="relative aspect-video w-full overflow-hidden bg-[#f5f3f9]">
        {/* Scene number badge */}
        <div
          className="absolute left-3 top-3 z-10 rounded-md px-2 py-1 font-mono-num text-[11px] font-medium backdrop-blur-md"
          style={{
            background: "rgba(255,255,255,0.88)",
            color: "var(--accent-primary)",
            border: "1px solid rgba(139,111,232,0.14)",
          }}
        >
          {String(scene.order).padStart(2, "0")}
        </div>

        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrl!}
            alt={`Scene ${scene.order}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
            loading="lazy"
          />
        )}

        {showGenerating && !regenerating && (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <PulseRing />
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Generating…
            </span>
          </div>
        )}

        {scene.status === "waiting" && (
          <div className="flex h-full items-center justify-center">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Waiting…
            </span>
          </div>
        )}

        {(failed || regenerating) && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            {regenerating ? (
              <>
                <PulseRing />
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Queuing…
                </span>
              </>
            ) : (
              <>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ background: "rgba(239,68,68,0.08)" }}
                >
                  <ImageOff size={18} strokeWidth={1.5} style={{ color: "#EF4444" }} />
                </div>
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
                  style={{ background: "var(--accent-primary)" }}
                >
                  <RefreshCw size={11} strokeWidth={2.5} />
                  Retry
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 py-3.5">
        {/* Script excerpt */}
        <p
          className="mb-4 flex-1 text-[13px] leading-[1.65]"
          style={{ color: "var(--text-primary)" }}
        >
          &ldquo;{scene.scriptExcerpt}&rdquo;
        </p>

        {/* Error */}
        {cardError && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2">
            <AlertTriangle size={12} strokeWidth={2} style={{ color: "#EF4444", flexShrink: 0 }} />
            <p className="text-[11px] text-red-600">{cardError}</p>
          </div>
        )}

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--surface-border)" }}>
          {terminal && (
            <button
              id={`regenerate-${scene.id}`}
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-50"
              style={{
                borderColor: "var(--surface-border)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
            >
              {regenerating ? (
                <Loader2 size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <RefreshCw size={12} strokeWidth={2} />
              )}
              Regenerate
            </button>
          )}

          {showImage && (
            <button
              id={`download-${scene.id}`}
              onClick={handleDownload}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              style={{
                borderColor: "var(--surface-border)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
              title="Download image"
            >
              <Download size={12} strokeWidth={2} />
              Download
            </button>
          )}

          {/* Edit prompt */}
          <button
            id={`edit-prompt-${scene.id}`}
            onClick={() => setPromptOpen((v) => !v)}
            className="ml-auto flex items-center gap-1 whitespace-nowrap text-[12px] font-medium transition-colors"
            style={{ color: promptOpen ? "var(--accent-primary)" : "var(--text-muted)" }}
            aria-expanded={promptOpen}
          >
            Edit prompt
            <ChevronDown
              size={13}
              strokeWidth={2}
              className="transition-transform duration-200"
              style={{
                transform: promptOpen ? "rotate(180deg)" : "rotate(0deg)",
                color: "inherit",
              }}
            />
          </button>
        </div>

        {/* Collapsible prompt editor */}
        {promptOpen && (
          <div className="mt-3 animate-fade-in">
            {scene.promptSource === "user-edited" && (
              <span
                className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "var(--accent-primary-soft)",
                  color: "var(--accent-primary)",
                }}
              >
                <Check size={8} strokeWidth={3} />
                Edited
              </span>
            )}
            <textarea
              ref={textareaRef}
              id={`prompt-text-${scene.id}`}
              className="w-full resize-none rounded-xl border p-3 text-[12px] leading-relaxed outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(139,111,232,0.12)]"
              style={{
                background: "#faf9fb",
                borderColor: "var(--surface-border)",
                color: "var(--text-primary)",
                minHeight: 80,
              }}
              value={promptDraft}
              onChange={(e) => {
                setPromptDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              aria-label={`Prompt for scene ${scene.order}`}
            />
            <div className="mt-2 flex items-center gap-2.5">
              <button
                onClick={handleSavePrompt}
                disabled={saving || promptDraft === scene.prompt}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--accent-primary)" }}
              >
                {saving ? (
                  <Loader2 size={11} strokeWidth={2.5} className="animate-spin" />
                ) : (
                  <Check size={11} strokeWidth={2.5} />
                )}
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={handleResetPrompt}
                disabled={resetting}
                className="flex items-center gap-1.5 text-[12px] font-medium disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                {resetting ? (
                  <Loader2 size={11} strokeWidth={2} className="animate-spin" />
                ) : (
                  <RotateCcw size={11} strokeWidth={2} />
                )}
                {resetting ? "Resetting…" : "Reset to auto"}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function PulseRing() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center">
      <div
        className="absolute inset-0 animate-ping rounded-full opacity-20"
        style={{ background: "var(--accent-primary)" }}
      />
      <div
        className="relative flex h-8 w-8 items-center justify-center rounded-full"
        style={{ background: "var(--accent-primary-soft)" }}
      >
        <RefreshCw size={14} strokeWidth={2} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
      </div>
    </div>
  );
}
