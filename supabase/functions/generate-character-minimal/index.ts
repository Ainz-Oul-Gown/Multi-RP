// supabase/functions/generate-character-minimal/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  return new Response(JSON.stringify({ ok: true, url: SUPABASE_URL }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
