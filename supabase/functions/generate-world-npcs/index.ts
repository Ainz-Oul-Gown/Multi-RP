// supabase/functions/generate-world-npcs/index.ts
// Только сохранение NPC в БД (генерация происходит на фронтенде)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanTextForAI } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function cleanNPC(npc: any, world_id: string) {
  // Validate role
  const validRoles = ["main", "secondary", "tertiary"];
  const role = validRoles.includes(npc.role) ? npc.role : "secondary";
  
  return {
    world_id,
    role,
    name: cleanTextForAI(npc.name) || "Безымянный",
    race: cleanTextForAI(npc.race) || "Человек",
    category: ["npc", "beast", "monster", "boss"].includes(npc.category) ? npc.category : "npc",
    appearance: cleanTextForAI(npc.appearance) || "",
    background: cleanTextForAI(npc.background) || "",
    status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10) : [],
    habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10) : [],
    catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10) : [],
    stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: Number(npc.hp) || 30,
    max_hp: Number(npc.max_hp) || 30,
    location_id: npc.location_id || null,
    state_id: npc.state_id || null,
    // Combat stats
    level: Number(npc.level) || 1,
    armor_class: Number(npc.armor_class) || 10,
    initiative: Number(npc.initiative) || 0,
    saving_throws: npc.saving_throws && typeof npc.saving_throws === 'object' ? npc.saving_throws : {},
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[save-npcs:${requestId}] ═══════════════════════════════════════`);

  try {
    const raw = await req.text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Некорректный JSON" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const world_id = parsed.world_id;
    const npcs = parsed.npcs;

    if (!world_id || !Array.isArray(npcs) || npcs.length === 0) {
      return new Response(
        JSON.stringify({ error: "world_id и npcs обязательны" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`[save-npcs:${requestId}] 💾 Saving ${npcs.length} NPCs to world ${world_id}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const npcsToInsert = npcs.map(npc => cleanNPC(npc, world_id));

    const { data: insertedNpcs, error: insertError } = await supabase
      .from("npcs")
      .insert(npcsToInsert)
      .select();

    if (insertError) {
      console.error(`[save-npcs:${requestId}] ❌ DB error:`, insertError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения", details: insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`[save-npcs:${requestId}] ✅ Saved ${insertedNpcs.length} NPCs`);

    return new Response(
      JSON.stringify({ success: true, count: insertedNpcs.length, npcs: insertedNpcs }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[save-npcs:${requestId}] ❌ Error:`, err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
