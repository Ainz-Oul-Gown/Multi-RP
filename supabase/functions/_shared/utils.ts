// supabase/functions/_shared/utils.ts
// Общие чистые утилиты для Edge Functions

export function sanitizeKey(raw: string): string {
  return (raw || "").trim().replace(/[^\x20-\x7E]/g, "");
}

export function cleanTextForAI(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  text = text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "");
  text = text.replace(/\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi, "");
  text = text.replace(/[A-Za-z0-9+\/]{20,}={0,2}/g, "");
  text = text.replace(/https?:\/\/[^\s]+/g, "");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 4000) text = text.slice(0, 4000);
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

export function validateAndFixStats(raw: any): StatsRecord {
  const result: StatsRecord = {
    STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
  };
  let sum = 0;

  for (const s of VALID_STATS) {
    const val = Math.min(18, Math.max(3, Math.round(Number(raw?.[s]) || 10)));
    result[s] = val;
    sum += val;
  }

  if (sum !== 72) {
    const diff = 72 - sum;
    let adjustStat: StatKey = "STR";
    let maxDist = 0;
    for (const s of VALID_STATS) {
      const dist = Math.abs(result[s] - 10);
      if (dist > maxDist) {
        maxDist = dist;
        adjustStat = s;
      }
    }
    result[adjustStat] = Math.min(18, Math.max(3, result[adjustStat] + diff));
  }

  return result;
}
