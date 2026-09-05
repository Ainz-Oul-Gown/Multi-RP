// supabase/functions/_shared/fog_location_generator.ts
// Автоматическая генерация карты расстояний (location_map) и типа местности (terrain_type) через ИИ.
// Вызывается при создании стартовой локации, смене локации или входе в дикую зону.

import { cleanTextForAI, parseAIJson } from "./utils.ts";

export type TerrainType = "open" | "forest" | "cave" | "urban" | "building" | "mountain";

export interface LocationMapResult {
  terrain_type: TerrainType;
  zones: string[];
  location_map: Record<string, Record<string, number>>;
}

/** Модификаторы дальности распространения звука и видимости в зависимости от типа местности */
export const TERRAIN_MODIFIERS: Record<TerrainType, { audioMod: number; visualMod: number }> = {
  open:     { audioMod: 1,  visualMod: 2 },  // открытое пространство: звук +1 тир, видимость +2 тира
  forest:   { audioMod: -1, visualMod: -2 }, // густой лес: деревья глушат звук (-1) и закрывают обзор (-2)
  cave:     { audioMod: 2,  visualMod: -3 }, // пещера: сильное эхо (+2 к звуку), но темнота и повороты (-3)
  urban:    { audioMod: 0,  visualMod: -1 }, // городская среда: экранирующие стены (-1 к видимости)
  building: { audioMod: -1, visualMod: -2 }, // внутри здания: перегородки, двери (-1 звук, -2 видимость)
  mountain: { audioMod: -1, visualMod: 1 },  // горы: возвышенность увеличивает видимость (+1), скалы дробят звук (-1)
};

/**
 * Промпт для генерации зон и матрицы расстояний локации через ИИ
 */
export function buildLocationMapPrompt(params: {
  locationName: string;
  locationType?: string | null;
  locationDescription?: string | null;
  isWildZone?: boolean;
}): string {
  const { locationName, locationType, locationDescription, isWildZone } = params;

  return `Ты — картограф и архитектор пространств ЛитРПГ/D&D игры.
Твоя задача — разбить локацию на логические подзоны, определить тип местности (для акустики и видимости тумана войны) и составить матрицу расстояний между подзонами.

ЛОКАЦИЯ: "${cleanTextForAI(locationName)}"
ТИП: ${locationType || (isWildZone ? "дикая природа" : "поселение")}
ОПИСАНИЕ: ${cleanTextForAI(locationDescription || "Локация игрового мира")}

ТИПЫ МЕСТНОСТИ (terrain_type) — выбери строго один:
- "open": открытое пространство (поляна, поле, степь, равнина, морской/речной берег, пустыня)
- "forest": густой лес, роща, джунгли, чаща
- "cave": пещера, катакомбы, подземелье, штольня, шахта
- "urban": город, улицы, площади, переулки
- "building": внутри помещения, таверна, замок, башня, храм, подвал
- "mountain": горы, скалы, ущелье, перевал

ШКАЛА РАССТОЯНИЙ (Distance Tiers от 0 до 5):
0 = в одной комнате/той же точке (~0м)
1 = вплотную / за тонкой стеной / соседняя дверь (~10м)
2 = рядом / через двор / соседнее здание (~50м)
3 = другой квартал / дальняя опушка (~200м)
4 = противоположный конец локации (~1км)
5 = за пределами локации (>1км)

ПРАВИЛА:
1. Выдели от 3 до 6 характерных подзон локации (например, для таверны: "Главный зал", "Стойка хозяина", "Комнаты 2 этажа", "Погреб", "Задний двор").
2. Матрица location_map должна содержать расстояния между всеми парами подзон (числа от 0 до 5).
3. Матрица ОБЯЗАНА быть симметричной: если от "Зона А" до "Зона Б" = 2, то и от "Зона Б" до "Зона А" = 2.

Верни СТРОГО валидный JSON без markdown-обёрток (\`\`\`json):
{
  "terrain_type": "building",
  "zones": ["Главный зал", "Комнаты 2 этажа", "Погреб", "Задний двор"],
  "location_map": {
    "Главный зал": { "Комнаты 2 этажа": 1, "Погреб": 2, "Задний двор": 2 },
    "Комнаты 2 этажа": { "Главный зал": 1, "Погреб": 3, "Задний двор": 2 },
    "Погреб": { "Главный зал": 2, "Комнаты 2 этажа": 3, "Задний двор": 3 },
    "Задний двор": { "Главный зал": 2, "Комнаты 2 этажа": 2, "Погреб": 3 }
  }
}`;
}

/**
 * Эвристический фоллбэк при недоступности ИИ
 */
export function buildFallbackLocationMap(name: string, type?: string | null): LocationMapResult {
  const lower = (name + " " + (type || "")).toLowerCase();

  let terrain_type: TerrainType = "urban";
  let zones: string[] = ["Центральная площадь", "Главная улица", "Торговый ряд", "Окраина"];

  if (/полян|поле|степ|пустын|берег|пляж|равнин|море|озеро|plain|field|open/i.test(lower)) {
    terrain_type = "open";
    zones = ["Центральная поляна", "Опушка у ручья", "Дальний край поляны", "Холм у горизонта"];
  } else if (/лес|рощ|чащ|джунгл|бор|тайг|дерев|forest|wood/i.test(lower)) {
    terrain_type = "forest";
    zones = ["Опушка леса", "Густая чаща", "Звериная тропа", "Старый бурелом"];
  } else if (/пещер|грот|катакомб|шахт|штольн|подземел|подвал|штрек|cave|dungeon|mine/i.test(lower)) {
    terrain_type = "cave";
    zones = ["Вход в пещеру", "Центральный грот", "Узкий лаз", "Глубокие тоннели"];
  } else if (/таверн|трактир|постоял|гостиниц|дом|покои|замок|башн|крепост|храм|зал|tavern|inn|building|castle/i.test(lower)) {
    terrain_type = "building";
    zones = ["Главный зал", "Стойка хозяина", "Комнаты на этаже", "Внутренний двор"];
  } else if (/гор|скал|ущел|перевал|пик|хребет|cliff|mountain/i.test(lower)) {
    terrain_type = "mountain";
    zones = ["Подножие скалы", "Горный карниз", "Узкое ущелье", "Вершина перевала"];
  }

  const map: Record<string, Record<string, number>> = {};
  for (let i = 0; i < zones.length; i++) {
    map[zones[i]] = {};
    for (let j = 0; j < zones.length; j++) {
      if (i !== j) {
        map[zones[i]][zones[j]] = Math.min(5, Math.abs(i - j) + 1);
      }
    }
  }

  return { terrain_type, zones, location_map: map };
}

/**
 * Нормализация карты расстояний, сгенерированной ИИ
 */
function normalizeLocationMap(parsed: any, fallback: LocationMapResult): LocationMapResult {
  const validTerrains: TerrainType[] = ["open", "forest", "cave", "urban", "building", "mountain"];
  const terrain_type: TerrainType = validTerrains.includes(parsed?.terrain_type)
    ? parsed.terrain_type
    : fallback.terrain_type;

  let zones: string[] = Array.isArray(parsed?.zones) && parsed.zones.length >= 2
    ? parsed.zones.map((z: any) => String(z).trim()).filter(Boolean)
    : fallback.zones;

  const rawMap = parsed?.location_map;
  if (!rawMap || typeof rawMap !== "object") {
    return { terrain_type, zones, location_map: fallback.location_map };
  }

  // Создаем симметричную карту
  const normalizedMap: Record<string, Record<string, number>> = {};
  for (const z of zones) {
    normalizedMap[z] = {};
  }

  for (const zA of zones) {
    for (const zB of zones) {
      if (zA === zB) continue;
      let dist = rawMap?.[zA]?.[zB] ?? rawMap?.[zB]?.[zA];
      if (dist === undefined || isNaN(Number(dist))) {
        dist = 2; // разумный дефолт (соседняя зона)
      } else {
        dist = Math.max(0, Math.min(5, Math.round(Number(dist))));
      }
      normalizedMap[zA][zB] = dist;
      normalizedMap[zB][zA] = dist;
    }
  }

  return {
    terrain_type,
    zones,
    location_map: normalizedMap,
  };
}

/**
 * Генерация карты расстояний и типа местности локации через ИИ с сохранением в Supabase.
 */
export async function ensureLocationMapAndTerrain(params: {
  supabase: any;
  sessionId: string;
  locationId?: string | null;
  locationName: string;
  locationType?: string | null;
  locationDescription?: string | null;
  isWildZone?: boolean;
  openrouterApiKey?: string;
  model?: string;
}): Promise<LocationMapResult> {
  const {
    supabase,
    sessionId,
    locationId,
    locationName,
    locationType,
    locationDescription,
    isWildZone,
    openrouterApiKey,
    model = "xiaomi/mimo-v2.5",
  } = params;

  const fallback = buildFallbackLocationMap(locationName, locationType);
  let result: LocationMapResult = fallback;

  if (openrouterApiKey) {
    try {
      const prompt = buildLocationMapPrompt({
        locationName,
        locationType,
        locationDescription,
        isWildZone,
      });

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Ты — картограф ЛитРПГ. Отвечай строго валидным JSON без лишних слов.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || "";
        const parsed = parseAIJson(content);
        if (parsed) {
          result = normalizeLocationMap(parsed, fallback);
        }
      }
    } catch (err) {
      console.warn("[fog_location_generator] AI call failed, using fallback:", err);
    }
  }

  // Сохраняем сгенерированные данные в сессию
  try {
    const sessionUpdate: Record<string, any> = {
      location_map: result.location_map,
      current_terrain_type: result.terrain_type,
    };
    await supabase.from("sessions").update(sessionUpdate).eq("id", sessionId);

    // Если это именованная локация — обновляем и locations.terrain_type
    if (locationId) {
      await supabase
        .from("locations")
        .update({ terrain_type: result.terrain_type })
        .eq("id", locationId);
    }

    console.log(`[fog_location_generator] Saved location_map (${result.zones.length} zones, terrain: ${result.terrain_type}) for session ${sessionId}`);
  } catch (dbErr) {
    console.warn("[fog_location_generator] Failed to persist location_map to DB:", dbErr);
  }

  return result;
}
