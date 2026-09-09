// supabase/functions/process-turn/steps/fog_of_war_utils.ts

import { TERRAIN_MODIFIERS } from "../../_shared/fog_location_generator.ts";

/** Distance Tier — уровни расстояния */
export const DISTANCE_TIER = { SAME_ROOM: 0, CLOSE: 1, NEARBY: 2, DISTRICT: 3, FAR: 4, VERY_FAR: 5 };

/** Пороги слышимости/видимости по типу события */
const FOG_THRESHOLDS: Record<string, { audioTier: number; visualTier: number }> = {
  whisper:       { audioTier: 0, visualTier: 0 },
  speech:        { audioTier: 2, visualTier: 1 },
  shout:         { audioTier: 2, visualTier: 1 },
  combat_light:  { audioTier: 1, visualTier: 1 },
  combat_medium: { audioTier: 2, visualTier: 1 },
  combat_heavy:  { audioTier: 3, visualTier: 2 },
  magic_minor:   { audioTier: 1, visualTier: 2 },
  magic_major:   { audioTier: 3, visualTier: 3 },
  explosion:     { audioTier: 4, visualTier: 4 },
  cataclysm:     { audioTier: 5, visualTier: 5 },
};

/** Шаблоны дистантного восприятия */
const FOG_TEMPLATES: Record<string, Record<number, { audio?: string[]; visual?: string[] }>> = {
  whisper: { 1: { audio: ["За стеной едва слышен тихий шёпот."] } },
  speech:  {
    1: { audio: ["Через стену доносится чей-то голос."] },
    2: { audio: ["Откуда-то неподалёку слышны голоса."] },
  },
  shout: {
    1: { audio: ["Сквозь стену кто-то прокричал: «{content}»", "За стеной раздался крик: «{content}»"] },
    2: { audio: ["Откуда-то {dir} донёсся крик.", "С {dir} долетел отчаянный возглас."] },
  },
  combat_light: {
    1: { audio: ["За стеной слышен шум возни.", "По ту сторону стены что-то упало."] },
    2: { audio: ["С {dir} доносится едва слышный шум."] },
  },
  combat_medium: {
    1: { audio: ["За стеной звенит сталь и слышны грузные удары."] },
    2: { audio: ["С {dir} доносится звон стали.", "Где-то {dir} идёт потасовка."] },
    3: { audio: ["С {dir} долетает отдалённый шум боя."] },
  },
  combat_heavy: {
    1: { audio: ["Оглушительный грохот — стены дрожат."] },
    2: { audio: ["С {dir} мощный удар, земля дрогнула."], visual: ["В стороне {dir} взметнулось облако пыли."] },
    3: { audio: ["На {dir} послышался взрыв."], visual: ["Над крышами {dir} поднимается дым."] },
  },
  magic_minor: {
    1: { visual: ["По ту сторону стены вспыхнул необычный свет."] },
    2: { visual: ["Откуда-то {dir} проскочила странная вспышка."] },
  },
  magic_major: {
    1: { audio: ["За стеной — оглушительная вспышка."] },
    2: { audio: ["С {dir} удар грома."], visual: ["Над {dir} вспыхнул ослепительный свет."] },
    3: { audio: ["На {dir} что-то взорвалось с магическим грохотом."], visual: ["На горизонте {dir} расцвёл всплеск энергии."] },
  },
  explosion: {
    1: { audio: ["Оглушительный взрыв! Стены дрожат."] },
    2: { audio: ["Рядом {dir} прогремел взрыв."], visual: ["С {dir} взметнулись языки пламени."] },
    3: { audio: ["На {dir} отдалённый взрыв, земля дрогнула."], visual: ["Над крышами {dir} клубится чёрный дым."] },
    4: { audio: ["Издалека {dir} донёсся едва слышный гром."], visual: ["Вдали {dir} поднимается столб дыма."] },
  },
  cataclysm: {
    2: { audio: ["С {dir} чудовищный грохот, земля трясётся."], visual: ["Небо {dir} окрашивается в багровый цвет."] },
    3: { audio: ["Земля дрожит — на {dir} что-то невообразимое."], visual: ["Горизонт {dir} пылает."] },
    4: { audio: ["Отдалённый гул и дрожание почвы с {dir}."], visual: ["На горизонте {dir} — зарево."] },
    5: { visual: ["Вдали {dir} что-то горит — столб дыма виден даже отсюда."] },
  },
};

const FOG_DIRS = ["севере", "юге", "востоке", "западе", "северо-востоке", "юго-западе"];

export function fogPickNarrative(eventType: string, tier: number, content: string): string | null {
  const tpl = FOG_TEMPLATES[eventType]?.[tier];
  if (!tpl) return null;
  const lines = [...(tpl.audio || []), ...(tpl.visual || [])];
  if (!lines.length) return null;
  const dir = FOG_DIRS[Math.floor(Math.random() * FOG_DIRS.length)];
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line.replace(/\{dir\}/g, dir).replace(/\{content\}/g, content || "...");
}

/**
 * Расчёт эффективных порогов слышимости и видимости с учётом типа местности (terrain_type).
 */
export function fogGetEffectiveThresholds(eventType: string, terrainType?: string | null): { audioTier: number; visualTier: number } {
  const base = FOG_THRESHOLDS[eventType] || FOG_THRESHOLDS.combat_medium;
  const mod = terrainType && (TERRAIN_MODIFIERS as any)[terrainType]
    ? (TERRAIN_MODIFIERS as any)[terrainType]
    : { audioMod: 0, visualMod: 0 };

  return {
    audioTier: Math.max(0, Math.min(5, base.audioTier + mod.audioMod)),
    visualTier: Math.max(0, Math.min(5, base.visualTier + mod.visualMod)),
  };
}

export function fogGetDistanceTier(sourceZone: string | null, targetZone: string | null, locationMap: Record<string, Record<string, number>>): number {
  if (!sourceZone || !targetZone) return 0;
  if (sourceZone === targetZone) return 0;
  const direct = locationMap?.[sourceZone]?.[targetZone];
  if (direct !== undefined) return Number(direct);
  const reverse = locationMap?.[targetZone]?.[sourceZone];
  if (reverse !== undefined) return Number(reverse);
  return DISTANCE_TIER.CLOSE; // разные зоны, карты нет → считаем соседними
}

export function fogExtractSpeech(actionText: string): string {
  const m = actionText.match(/[«"]([^»"]{1,120})[»"]/);
  return m ? m[1] : "";
}
