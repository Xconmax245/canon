"use client";

import { useState } from "react";
import {
  Film,
  Sparkles,
  BookOpen,
  Camera,
  Wand2,
  Skull,
  Brush,
  ArrowRight,
  Loader2,
  Plus,
  Check,
  History as HistoryIcon,
  type LucideIcon,
} from "lucide-react";
import { STYLE_PRESETS } from "@/lib/types";

type Preset = (typeof STYLE_PRESETS)[number];

const PRESET_META: Record<
  Preset,
  { icon: LucideIcon; label: string; description: string }
> = {
  cinematic: {
    icon: Film,
    label: "Cinematic",
    description: "Widescreen drama, moody depth of field",
  },
  anime: {
    icon: Sparkles,
    label: "Anime",
    description: "Vivid linework, expressive characters",
  },
  comic: {
    icon: BookOpen,
    label: "Comic",
    description: "Bold panels, inked outlines, halftone energy",
  },
  photorealistic: {
    icon: Camera,
    label: "Photorealistic",
    description: "Hyper-detailed, camera-accurate imagery",
  },
  fantasy: {
    icon: Wand2,
    label: "Fantasy",
    description: "Painterly, sweeping worlds and magic",
  },
  horror: {
    icon: Skull,
    label: "Horror",
    description: "Dark atmosphere, desaturated, unsettling",
  },
  illustration: {
    icon: Brush,
    label: "Illustration",
    description: "Textured, editorial, hand-crafted feel",
  },
};

interface CreateViewProps {
  onGenerate: (script: string, styleDirective: string) => void;
  onViewHistory: () => void;
  initialError?: string | null;
}

export function CreateView({ onGenerate, onViewHistory, initialError }: CreateViewProps) {
  const [script, setScript] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Preset>("cinematic");
  const [customStyle, setCustomStyle] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);

  const styleDirective = useCustom ? customStyle.trim() : selectedPreset;

  const canSubmit =
    script.trim().length >= 20 &&
    (useCustom ? customStyle.trim().length >= 3 : true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    await onGenerate(script.trim(), styleDirective);
    setLoading(false);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      {/* Background orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 700,
            height: 500,
            background:
              "radial-gradient(ellipse 65% 55% at 50% 20%, rgba(139,111,232,0.2) 0%, rgba(255,79,160,0.06) 50%, transparent 70%)",
            filter: "blur(32px)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[640px]" data-aos="fade-up">
        {/* Title / History Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-[28px] font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Storyboard Generator
          </h1>
          <button
            onClick={onViewHistory}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
          >
            <HistoryIcon size={15} />
            History
          </button>
        </div>

        {/* Wordmark */}
        <div className="mb-10 text-center">
          <p
            className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--accent-primary)" }}
          >
            Canon
          </p>
          <h2
            className="text-[2.6rem] font-semibold leading-[1.1] tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Paste your script.
            <br />
            Get your storyboard.
          </h2>
          <p
            className="mt-4 text-[15px] leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Canon reads your script, understands the story, and generates a
            coherent visual storyboard.
          </p>
        </div>

        {/* Error */}
        {initialError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {initialError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Script textarea */}
          <div
            className="rounded-2xl border transition-shadow focus-within:shadow-[0_0_0_3px_rgba(139,111,232,0.12)]"
            data-aos="fade-up"
            data-aos-delay="100"
            style={{
              background: "var(--surface)",
              borderColor: "var(--surface-border)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            }}
          >
            <textarea
              id="script-input"
              className="w-full resize-none rounded-2xl bg-transparent px-5 pt-4 pb-2 text-[14px] leading-[1.7] outline-none placeholder:text-[var(--text-muted)]"
              style={{ color: "var(--text-primary)", minHeight: 200 }}
              placeholder="Paste your script here — a short film, an episode scene, a commercial brief, a novel excerpt..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              aria-label="Script text"
            />
            <div
              className="flex items-center justify-end px-5 py-2.5"
              style={{ borderTop: "1px solid var(--surface-border)" }}
            >
              <span
                className="font-mono-num text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {script.trim().length.toLocaleString()} chars
              </span>
            </div>
          </div>

          {/* Visual Style */}
          <div data-aos="fade-up" data-aos-delay="200">
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--text-muted)" }}
            >
              Visual Style
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLE_PRESETS.map((preset) => {
                const { icon: Icon, label, description } = PRESET_META[preset];
                const active = !useCustom && selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset);
                      setUseCustom(false);
                    }}
                    className="group relative flex flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-all duration-150 hover:shadow-sm"
                    style={{
                      background: active ? "var(--accent-primary-soft)" : "var(--surface)",
                      borderColor: active ? "var(--accent-primary)" : "var(--surface-border)",
                      boxShadow: active ? "0 0 0 1.5px var(--accent-primary)" : undefined,
                    }}
                    aria-pressed={active}
                  >
                    {active && (
                      <span
                        className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full"
                        style={{ background: "var(--accent-primary)" }}
                      >
                        <Check size={9} strokeWidth={3} color="white" />
                      </span>
                    )}
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{
                        background: active ? "rgba(139,111,232,0.15)" : "rgba(0,0,0,0.04)",
                      }}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.75}
                        className="transition-colors"
                        style={{ color: active ? "var(--accent-primary)" : "var(--text-muted)" }}
                      />
                    </span>
                    <span
                      className="text-[12px] font-semibold"
                      style={{
                        color: active ? "var(--accent-primary)" : "var(--text-primary)",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-[10px] leading-tight"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {description}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom style */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setUseCustom((v) => !v)}
                className="flex items-center gap-1.5 text-[12px] font-medium transition-colors"
                style={{ color: useCustom ? "var(--accent-primary)" : "var(--text-muted)" }}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded border transition-colors"
                  style={{
                    borderColor: useCustom ? "var(--accent-primary)" : "var(--surface-border)",
                    background: useCustom ? "var(--accent-primary-soft)" : "transparent",
                  }}
                >
                  {useCustom ? (
                    <Check size={9} strokeWidth={3} style={{ color: "var(--accent-primary)" }} />
                  ) : (
                    <Plus size={9} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
                  )}
                </span>
                Custom style directive
              </button>
              {useCustom && (
                <input
                  id="custom-style-input"
                  type="text"
                  className="mt-2 w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(139,111,232,0.12)]"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--surface-border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder='e.g. "Studio Ghibli watercolor with pastel skies"'
                  value={customStyle}
                  onChange={(e) => setCustomStyle(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Generate */}
          <div className="flex justify-end pt-1" data-aos="fade-up" data-aos-delay="300">
            <button
              id="generate-btn"
              type="submit"
              disabled={!canSubmit || loading}
              className="flex items-center gap-2.5 rounded-full px-8 py-3.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{
                background: "var(--accent-primary)",
                boxShadow:
                  canSubmit && !loading
                    ? "0 4px 20px rgba(139,111,232,0.4), 0 1px 4px rgba(0,0,0,0.08)"
                    : "none",
              }}
            >
              {loading ? (
                <Loader2 size={16} strokeWidth={2} className="animate-spin" />
              ) : (
                <ArrowRight size={16} strokeWidth={2.25} />
              )}
              {loading ? "Starting…" : "Generate Storyboard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
