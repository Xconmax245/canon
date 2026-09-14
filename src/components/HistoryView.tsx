import { useEffect, useState } from "react";
import { getProjects, type ProjectHistoryItem } from "@/lib/api-client";
import { ChevronLeft, Loader2, LayoutGrid, AlertCircle, RefreshCw } from "lucide-react";

interface HistoryViewProps {
  onBack: () => void;
  onSelectProject: (projectId: string, status: string) => void;
}

export function HistoryView({ onBack, onSelectProject }: HistoryViewProps) {
  const [projects, setProjects] = useState<ProjectHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await getProjects();
        setProjects(res.projects);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-12 pb-24 min-h-dvh flex flex-col" data-aos="fade-in">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[14px] font-medium transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Back to Create
        </button>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Project History
        </h1>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <AlertCircle size={24} className="text-red-500 mb-2" />
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            {error}
          </p>
          <button onClick={() => window.location.reload()} className="text-[13px] text-blue-500 mt-2 underline">
            Try again
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center gap-3">
          <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
            <LayoutGrid size={20} style={{ color: "var(--text-muted)" }} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>No projects yet</p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Your generated storyboards will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p, i) => {
            const isDone = p.status === "completed" || p.status === "failed";
            const isCancelled = p.status === "cancelled";
            const date = new Date(p.createdAt).toLocaleDateString(undefined, { 
              month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' 
            });

            return (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id, p.status)}
                className="group relative flex flex-col items-start gap-3 p-5 rounded-xl text-left transition-all"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                }}
                data-aos="fade-up"
                data-aos-delay={Math.min(i * 50, 400)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {date}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full capitalize" style={{ 
                    background: isDone ? "rgba(34, 197, 94, 0.1)" : isCancelled ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                    color: isDone ? "#22c55e" : isCancelled ? "#ef4444" : "#3b82f6" 
                  }}>
                    {p.status}
                  </span>
                </div>
                
                <div className="w-full mt-1">
                  <h3 className="text-[16px] font-semibold truncate capitalize" style={{ color: "var(--text-primary)" }}>
                    {p.visualStyleDirective || "Cinematic"} Style
                  </h3>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    {p._count.scenes} scenes • {p.aspectRatio}
                  </p>
                </div>

                <div className="absolute inset-0 rounded-xl ring-2 ring-transparent transition-all group-hover:ring-blue-500/20" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
