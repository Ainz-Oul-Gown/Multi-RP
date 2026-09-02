// supabase/functions/_shared/utils.ts
// Общие чистые утилиты для Edge Functions

export function sanitizeKey(raw: string): string {
  return (raw || "").trim().replace(/[^\x20-\x7E]/g, "");
}

export function cleanTextForAI(raw: string | null | undefined, maxLength: number = 4000): string {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  text = text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u0400-\u04FF]/g, "");
  text = text.replace(/data:image\/[^;\n\r]+;base64,[^\s]+/gi, "");
  text = text.replace(/\b(?:image|img|photo|picture|avatar|icon|base64)\b[^\n\r]*?\.(?:png|jpg|jpeg|gif|webp|bmp|svg)\b/gi, "");
  text = text.replace(/[A-Za-z0-9+\/]{20,}={0,2}/g, "");
  text = text.replace(/https?:\/\/[^\s]+/g, "");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

const VALID_STATS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type StatKey = typeof VALID_STATS[number];
export type StatsRecord = Record<StatKey, number>;

export function parseAIJson(text: string): any {
  // Try direct parse, then unwrap if it's a stats wrapper
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      if (VALID_STATS.some((k) => keys.includes(k))) {
        return parsed;
      }
      for (const val of Object.values(parsed)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const nestedKeys = Object.keys(val);
          if (VALID_STATS.some((k) => nestedKeys.includes(k))) {
            return val;
          }
        }
      }
      return parsed;
    }
    return parsed;
  } catch {}

  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (VALID_STATS.some((k) => keys.includes(k))) {
          return parsed;
        }
        for (const val of Object.values(parsed)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const nestedKeys = Object.keys(val);
            if (VALID_STATS.some((k) => nestedKeys.includes(k))) {
              return val;
            }
          }
        }
        return parsed;
      }
      return parsed;
    } catch {}
  }

  // Scan for all JSON objects by tracking brace depth
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // If brace scanning found nothing, fallback to greedy regex
  if (candidates.length === 0) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) candidates.push(objMatch[0]);
  }

  // First pass: prioritize objects containing stat keys directly
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (VALID_STATS.some((k) => keys.includes(k))) {
          return parsed;
        }
        // If it's a wrapper, check nested objects for stats
        for (const val of Object.values(parsed)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const nestedKeys = Object.keys(val);
            if (VALID_STATS.some((k) => nestedKeys.includes(k))) {
              return val;
            }
          }
        }
      }
    } catch {}
  }

  // Second pass: return first parseable candidate
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }

  return null;
}

export function validateAndFixStats(raw: any, options: { forceSum72?: boolean } = {}): StatsRecord {
  const result: StatsRecord = {
    STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
  };

  for (const s of VALID_STATS) {
    const rawValue = raw?.[s];
    const num = Number(rawValue);
    const val = Number.isFinite(num) ? Math.round(num) : 10;
    result[s] = val;
  }

  if (options.forceSum72) {
    let sum = 0;
    for (const s of VALID_STATS) sum += result[s];
    const diff = 72 - sum;
    if (diff !== 0) {
      let adjustStat: StatKey = "STR";
      let maxDist = 0;
      for (const s of VALID_STATS) {
        const dist = Math.abs(result[s] - 10);
        if (dist > maxDist) {
          maxDist = dist;
          adjustStat = s;
        }
      }
      result[adjustStat] = result[adjustStat] + diff;
    }
  }

  return result;
}

export function calculateDerivedStats(stats = {}, race = 'Человек', equipment = [], raceAcBonus) {
  const safeStats = validateAndFixStats(stats);
  const initiative = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const dexMod = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const raceBonus = Number(raceAcBonus ?? 0);
  const equipmentBonus = Array.isArray(equipment)
    ? equipment.reduce((sum, item) => sum + (Number(item.ac_bonus) || 0), 0)
    : 0;
  const armorClass = 10 + dexMod + raceBonus + equipmentBonus;
  const savingThrows = {};
  for (const s of VALID_STATS) {
    const mod = Math.floor(((safeStats[s] || 10) - 10) / 2);
    savingThrows[s] = mod + 2;
  }
  return {
    stats: safeStats,
    initiative,
    armor_class: armorClass,
    saving_throws: savingThrows,
  };
}
