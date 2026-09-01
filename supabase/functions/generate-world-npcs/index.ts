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

// Валидация типа урона
const VALID_DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force'];

const DAMAGE_TYPE_NAMES: Record<string, string> = {
  slashing: 'Режущий', piercing: 'Колющий', bludgeoning: 'Дробящий',
  fire: 'Огненный', cold: 'Ледяной', lightning: 'Электрический', thunder: 'Звуковой',
  acid: 'Кислотный', poison: 'Ядовитый', necrotic: 'Некротический',
  radiant: 'Лучистый', psychic: 'Психический', force: 'Силовой',
};

const SAVE_ABILITIES: Record<string, string> = {
  fire: 'DEX', cold: 'CON', lightning: 'DEX', thunder: 'CON',
  acid: 'DEX', poison: 'CON', psychic: 'WIS', force: 'STR',
};

const DOT_TYPES = ['fire', 'acid', 'poison'];

function cleanAttack(a: any) {
  const damageType = VALID_DAMAGE_TYPES.includes(a?.damage_type) ? a.damage_type : 'slashing';
  const damageDice = /^\d+d\d+([+-]\d+)?$/.test(a?.damage_dice || a?.damage) 
    ? (a.damage_dice || a.damage) 
    : '1d6';
  
  const canDot = DOT_TYPES.includes(damageType);
  const isDot = canDot && (a?.is_dot === true || a?.is_damage_over_time === true);
  
  return {
    name: cleanTextForAI(a?.name) || 'Атака',
    description: cleanTextForAI(a?.description) || cleanTextForAI(a?.desc) || '',
    damage_type: damageType,
    damage_type_name: DAMAGE_TYPE_NAMES[damageType] || 'Физический',
    damage_dice: damageDice,
    damage_bonus: Number(a?.damage_bonus) || 0,
    is_special: a?.is_special === true,
    is_dot: isDot,
    dot_name: isDot ? cleanTextForAI(a?.dot_name) || 'Урон' : null,
    dot_duration: isDot ? Math.max(1, Math.min(10, Number(a?.dot_duration) || 2)) : 0,
    dot_damage_dice: isDot ? (/^\d+d\d+([+-]\d+)?$/.test(a?.dot_damage_dice) ? a.dot_damage_dice : damageDice) : null,
    half_on_save: SAVE_ABILITIES[damageType] !== undefined,
    save_ability: SAVE_ABILITIES[damageType] || null,
    range: cleanTextForAI(a?.range) || (a?.is_special ? '30 футов' : '5 футов'),
    effects: Array.isArray(a?.effects) ? a.effects.slice(0, 3).map((e: any) => cleanTextForAI(e)) : [],
  };
}

function cleanNPC(npc: any, world_id: string) {
  // Validate role
  const validRoles = ["main", "secondary", "tertiary"];
  const role = validRoles.includes(npc.role) ? npc.role : "secondary";
  
  // Validate tier and level
  const tier = Math.max(1, Math.min(5, Number(npc.tier) || 1));
  const level = Math.max(1, Math.min(100, Number(npc.level) || 1));
  
  // Calculate special attacks count by tier
  const specialAttacksCount = Math.max(1, Math.min(5, tier));
  const baseAttacksCount = Math.max(2, Math.min(10, 2 + Math.floor((level - 1) / 10)));
  
  // Clean attacks arrays
  const specialAttacks = Array.isArray(npc.special_attacks) 
    ? npc.special_attacks.slice(0, specialAttacksCount).map(cleanAttack)
    : [];
  const baseAttacks = Array.isArray(npc.base_attacks)
    ? npc.base_attacks.slice(0, baseAttacksCount).map(cleanAttack)
    : [];
  
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
    max_hp: Number(npc.max_hp) || Number(npc.hp) || 30,
    location_id: npc.location_id || null,
    state_id: npc.state_id || null,
    // Combat stats
    level,
    armor_class: Number(npc.armor_class) || 10,
    initiative: Number(npc.initiative) || 0,
    saving_throws: npc.saving_throws && typeof npc.saving_throws === 'object' ? npc.saving_throws : {},
    // Hit dice (D&D system)
    hit_dice: [6, 8, 10, 12].includes(Number(npc.hit_dice)) ? Number(npc.hit_dice) : 8,
    // Attacks
    special_attacks: specialAttacks,
    base_attacks: baseAttacks,
    // Pack/unique
    is_pack_instance: npc.is_pack_instance === true,
    pack_size: Math.max(1, Math.min(50, Number(npc.pack_size) || 1)),
    // Template reference
    template_id: npc.template_id || null,
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
