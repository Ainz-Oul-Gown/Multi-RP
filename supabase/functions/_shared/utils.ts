// supabase/functions/_shared/utils.ts
// Общие чистые утилиты для Edge Functions

export function sanitizeKey(raw: string): string {
  return (raw || "").trim().replace(/[^\x20-\x7E]/g, "");
}

export interface AIEndpointConfig {
  url: string;
  apiKey: string;
  isCustomEndpoint: boolean;
  timeoutMs: number;
}

/**
 * Распознаёт URL кастомного сервера (LM Studio, Ollama, Pinggy, localhost.run, Cloudflare Tunnel)
 * или стандартный ключ OpenRouter.
 * Позволяет передавать URL прямо в поле openrouter_key в настройках аккаунта (с опциональным |token).
 */
export function resolveAIEndpoint(rawKeyOrUrl?: string | null, defaultBaseUrl?: string): AIEndpointConfig {
  const trimmed = sanitizeKey(String(rawKeyOrUrl || ""));
  const envBase = defaultBaseUrl || (typeof Deno !== "undefined" ? Deno.env.get("AI_BASE_URL") : "") || "";

  if (/^https?:\/\//i.test(trimmed)) {
    const [rawUrlPart, customToken] = trimmed.split("|").map((s) => s.trim());
    let normalizedUrl = rawUrlPart.replace(/\/+$/, "");
    if (!normalizedUrl.endsWith("/chat/completions")) {
      normalizedUrl += normalizedUrl.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions";
    }
    return {
      url: normalizedUrl,
      apiKey: customToken || "lm-studio",
      isCustomEndpoint: true,
      timeoutMs: 90000,
    };
  }

  if (envBase && !envBase.includes("openrouter.ai")) {
    let normalizedUrl = envBase.trim().replace(/\/+$/, "");
    if (!normalizedUrl.endsWith("/chat/completions")) {
      normalizedUrl += normalizedUrl.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions";
    }
    return {
      url: normalizedUrl,
      apiKey: trimmed || "lm-studio",
      isCustomEndpoint: true,
      timeoutMs: 90000,
    };
  }

  return {
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: trimmed,
    isCustomEndpoint: false,
    timeoutMs: 25000,
  };
}

export function stripThinkingTags(raw: string): string {
  if (!raw) return "";
  // Удаляем завершённые блоки <think>...</think> (характерно для Qwen3/3.5, DeepSeek-R1, QwQ)
  let cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Если модель оборвалась по max_tokens внутри незакрытого <think>, пытаемся спасти JSON в конце
  if (cleaned.includes("<think>")) {
    const afterThink = cleaned.split(/<think>/i).pop() || "";
    const jsonStart = afterThink.indexOf("{");
    cleaned = jsonStart !== -1 ? afterThink.slice(jsonStart).trim() : afterThink.trim();
  }
  return cleaned;
}

/**
 * Извлекает контент ответа из message объекта OpenAI/LM Studio.
 * Если модель в LM Studio истратила max_tokens на reasoning_content и оставила content пустым,
 * пытается извлечь JSON или готовые русские абзацы из reasoning_content.
 */
export function extractAIMessageText(message: any): string {
  if (!message || typeof message !== "object") return "";
  const primary = stripThinkingTags(String(message.content || ""));
  if (primary.length > 0) return primary;

  const reasoning = String(message.reasoning_content || "").trim();
  if (!reasoning) return "";

  // 1. Проверяем, нет ли в конце reasoning_content готового JSON-блока
  const lastJsonStart = reasoning.lastIndexOf('{\n  "');
  if (lastJsonStart !== -1) {
    return reasoning.slice(lastJsonStart).trim();
  }

  // 2. Если это нарратор и модель успела написать черновики абзацев (Para 1 / Para 2 / Para 3 / Draft) на русском языке
  const cyrillicBlocks = reasoning
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\*+[^*]+\*+:?\s*|-\s*|\d+\.\s*)/g, "").trim())
    .filter((line) => {
      const cyrCount = (line.match(/[а-яёА-ЯЁ]/g) || []).length;
      const latCount = (line.match(/[a-zA-Z]/g) || []).length;
      return cyrCount >= 60 && cyrCount > latCount * 2 && !line.startsWith('"Осмотреть');
    });

  if (cyrillicBlocks.length > 0) {
    // Берем последние до 3 уникальных русских абзацев
    const uniqueParas: string[] = [];
    for (const b of cyrillicBlocks) {
      if (!uniqueParas.includes(b)) uniqueParas.push(b);
    }
    return uniqueParas.slice(-3).join("\n\n");
  }

  return "";
}

const _cachedCustomModelByUrl = new Map<string, string>();

/**
 * Для LM Studio в режиме Just-in-Time (JIT) loading: если выбрана заглушка "local-model"
 * или облачное имя модели (с "/"), автоматически запрашивает список моделей с GET /v1/models
 * и подставляет реальный идентификатор загруженной модели.
 */
export async function resolveCustomModelId(endpoint: AIEndpointConfig, requestedModel?: string): Promise<string> {
  const model = (requestedModel || "").trim();
  if (!endpoint.isCustomEndpoint) {
    return model || "google/gemma-4-31b-it:free";
  }
  // Если пользователь явно вписал локальное имя модели (не "local-model" и не облачный префикс OpenRouter)
  const CLOUD_PREFIXES = ["google/", "meta-llama/", "deepseek/", "openai/", "anthropic/", "mistralai/", "minimax/", "nvidia/", "xiaomi/", "openrouter/"];
  const isCloudSlug = CLOUD_PREFIXES.some((p) => model.startsWith(p)) || model.endsWith(":free");
  if (model && model !== "local-model" && !isCloudSlug) {
    return model;
  }

  const cached = _cachedCustomModelByUrl.get(endpoint.url);
  if (cached) return cached;

  const modelsUrl = endpoint.url.replace(/\/chat\/completions$/, "/models");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${endpoint.apiKey}`,
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        // Выбираем первую не-embedding модель
        const chatModel = list.find((m: any) => m?.id && !String(m.id).toLowerCase().includes("embed")) || list[0];
        if (chatModel?.id) {
          _cachedCustomModelByUrl.set(endpoint.url, String(chatModel.id));
          return String(chatModel.id);
        }
      }
    } catch {
      // Повторим ещё раз при холодном старте туннеля
    }
  }

  return model || "local-model";
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

export function parseAIJson(rawText: string): any {
  const text = stripThinkingTags(rawText);
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

export function getRaceAcBonus(race: string = 'Человек'): number {
  const map: Record<string, number> = {
    'Эльф': 0,
    'Дварф': 1,
    'Гном': 1,
    'Полурослик': 1,
    'Тифлинг': 0,
    'Драконорожденный': 0,
  };
  return Number(map[race] ?? 0);
}

export function calculateDerivedStats(stats: any = {}, race: string = 'Человек', equipment: any[] = [], raceAcBonus?: number) {
  const safeStats = validateAndFixStats(stats);
  const initiative = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const dexMod = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const raceBonus = Number(raceAcBonus !== undefined && raceAcBonus !== null ? raceAcBonus : getRaceAcBonus(race));
  const equipmentBonus = Array.isArray(equipment)
    ? equipment.reduce((sum: number, item: any) => sum + (Number(item?.ac_bonus) || 0), 0)
    : 0;
  const armorClass = 10 + dexMod + raceBonus + equipmentBonus;
  const savingThrows: Record<string, number> = {};
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
