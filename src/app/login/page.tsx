"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4" style={{ background: "var(--background)" }}>
      {/* Signature gradient bar at the top */}
      <div className="fixed left-0 right-0 top-0 h-[3px] w-full gradient-bar opacity-80" />

      <div className="w-full max-w-sm" data-aos="fade-up">
        {/* Brand */}
        <div className="mb-8 flex justify-center">
          <p
            className="text-[14px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--accent-primary)" }}
          >
            Canon
          </p>
        </div>

        {/* Login Card */}
        <div
          className="overflow-hidden rounded-[24px] border px-8 py-8 transition-shadow duration-300 hover:shadow-[0_12px_48px_rgba(139,111,232,0.12)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--surface-border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
          }}
        >
          <div className="mb-6">
            <h1 className="mb-2 text-[20px] font-semibold text-gray-900 tracking-tight">
              Welcome back
            </h1>
            <p className="text-[13px] leading-relaxed text-gray-500">
              Sign in to continue to Canon.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@poyotech.online"
                className="w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(139,111,232,0.12)]"
                style={{
                  background: "#faf9fb",
                  borderColor: "var(--surface-border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(139,111,232,0.12)]"
                style={{
                  background: "#faf9fb",
                  borderColor: "var(--surface-border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {error && (
              <div className="mt-1 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5">
                <AlertTriangle size={14} strokeWidth={2.5} className="mt-0.5 text-red-500 shrink-0" />
                <p className="text-[12px] text-red-600 font-medium leading-snug">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent-primary)" }}
            >
              {loading ? (
                <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={14} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
