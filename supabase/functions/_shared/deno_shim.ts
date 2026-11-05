// supabase/functions/_shared/deno_shim.ts
// Шим окружения Deno для локального исполнения Edge Functions внутри Vite / Node.js

const DEFAULT_ENV: Record<string, string> = {
  SUPABASE_URL:
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
    "https://xhzpxiiqrtmeduynqmsd.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    (typeof process !== "undefined" && process.env?.SUPABASE_SERVICE_ROLE_KEY) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE",
  SUPABASE_ANON_KEY:
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDU5NzEsImV4cCI6MjEwMTkyMTk3MX0.c2cdT2f4hD-jV1I-vG2I-6H_wK-6H8p6xY8W8qW8qW8",
  OPENROUTER_API_KEY:
    (typeof process !== "undefined" && (process.env?.OPENROUTER_API_KEY || process.env?.VITE_OPENROUTER_API_KEY)) ||
    "",
};

if (typeof (globalThis as any).Deno === "undefined") {
  (globalThis as any).Deno = {
    env: {
      get(key: string): string | undefined {
        if (typeof process !== "undefined" && process.env && process.env[key]) {
          return process.env[key];
        }
        return DEFAULT_ENV[key];
      },
      toObject(): Record<string, string> {
        return { ...DEFAULT_ENV, ...(typeof process !== "undefined" ? (process.env as any) : {}) };
      },
    },
  };
}

export type EdgeHandler = (req: Request) => Promise<Response> | Response;

if (!(globalThis as any).__edgeFunctionHandlers) {
  (globalThis as any).__edgeFunctionHandlers = new Map<string, EdgeHandler>();
}

export function serve(handler: EdgeHandler): EdgeHandler {
  (globalThis as any).__lastRegisteredEdgeHandler = handler;
  const activeSlug = (globalThis as any).__loadingEdgeFunctionSlug;
  if (activeSlug) {
    (globalThis as any).__edgeFunctionHandlers.set(activeSlug, handler);
  }
  return handler;
}
