/**
 * Server-only environment access. Never import this from client components.
 * Never return these values in API responses.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  return v.trim();
}

export const env = {
  openai: {
    apiKey: () => required("OPENAI_API_KEY"),
    model: () => optional("OPENAI_MODEL", "gpt-5-mini")!,
  },
  kie: {
    apiKey: () => required("KIE_API_KEY"),
    hmacKey: () => optional("KIE_WEBHOOK_HMAC_KEY"),
    webhookSecret: () => optional("KIE_WEBHOOK_SECRET"),
  },
  app: {
    baseUrl: () => optional("APP_BASE_URL", "http://localhost:3000")!,
    cronSecret: () => optional("CRON_SECRET"),
  },
  supabase: {
    url: () => required("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: () => optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  },
} as const;

export const KIE_BASE_URL = "https://api.kie.ai";
