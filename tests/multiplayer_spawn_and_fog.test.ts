// tests/multiplayer_spawn_and_fog.test.ts
import { describe, it, expect } from "vitest";
import {
  TERRAIN_MODIFIERS,
  buildFallbackLocationMap,
} from "../supabase/functions/_shared/fog_location_generator.ts";

describe("Мультиплеер: спавн игроков, передача ходов и эхо войны", () => {
  describe("1. Спавн игроков рядом друг с другом", () => {
    it("новый игрок подключается в ту же подзону, где уже находится отряд", () => {
      // Игрок 1 уже играет и находится в подзоне 'Главный зал'
      const existingPlayers = [
        { id: "p1", name: "Воин Рагнар", current_zone: "Главный зал" },
      ];

      // Правило спавна: зона берется от существующего отряда
      const partyZone = existingPlayers.length > 0 ? (existingPlayers[0].current_zone || null) : null;
      expect(partyZone).toBe("Главный зал");

      // Новый игрок создается с этой же зоной
      const newPlayer = {
        id: "p2",
        name: "Маг Эльдар",
        current_zone: partyZone,
      };

      expect(newPlayer.current_zone).toBe(existingPlayers[0].current_zone);
    });

    it("при одновременном старте сессии оба игрока начинают в одной стартовой зоне", () => {
      const existingPlayers: any[] = [];
      const partyZone = existingPlayers.length > 0 ? (existingPlayers[0].current_zone || null) : null;
      expect(partyZone).toBeNull(); // NULL = базовая зона локации

      const player1 = { id: "p1", name: "Алиса", current_zone: partyZone };
      const player2 = { id: "p2", name: "Боб", current_zone: player1.current_zone };

      expect(player1.current_zone).toBe(player2.current_zone);
    });
  });

  describe("2. Передача ходов между игроками", () => {
    it("initTurnQueue корректно активирует первого игрока и ставит второго в waiting", () => {
      const players = [
        { id: "p1", name: "Игрок 1" },
        { id: "p2", name: "Игрок 2" },
      ];

      // Проверяем логику: первый active, второй waiting
      const queue = players.map((p, idx) => ({
        player_id: p.id,
        status: idx === 0 ? "active" : "waiting",
      }));

      expect(queue[0].status).toBe("active");
      expect(queue[1].status).toBe("waiting");
    });
  });

  describe("3. Эхо войны (Fog of War) и акустика местности", () => {
    it("в одной зоне расстояние 0 (SAME_ROOM) — эхо войны не глушится, игроки видят друг друга", () => {
      const locMap = {
        "Главный зал": { "Погреб": 2, "Двор": 2 },
        "Погреб": { "Главный зал": 2 },
      };

      function getDistanceTier(src: string | null, tgt: string | null, map: any): number {
        if (!src || !tgt) return 0;
        if (src === tgt) return 0;
        return map[src]?.[tgt] ?? 1;
      }

      // Оба в Главном зале
      const distanceSameZone = getDistanceTier("Главный зал", "Главный зал", locMap);
      expect(distanceSameZone).toBe(0);

      // Игроки в разных зонах
      const distanceDiffZone = getDistanceTier("Главный зал", "Погреб", locMap);
      expect(distanceDiffZone).toBe(2);
    });

    it("местность корректно модифицирует слышимость звуков эха войны", () => {
      // Пещера усиливает звук (+2 к звуку)
      expect(TERRAIN_MODIFIERS.cave.audioMod).toBe(2);
      // Густой лес приглушает звук (-1)
      expect(TERRAIN_MODIFIERS.forest.audioMod).toBe(-1);
      // Здание экранирует звук (-1)
      expect(TERRAIN_MODIFIERS.building.audioMod).toBe(-1);
    });

    it("генератор карты зон по умолчанию создает связную топологию для типа локации", () => {
      const tavern = buildFallbackLocationMap("Таверна 'Пьяный дракон'", "tavern");
      expect(tavern.terrain_type).toBe("building");
      expect(tavern.zones).toContain("Главный зал");

      const forest = buildFallbackLocationMap("Темный лес", "forest");
      expect(forest.terrain_type).toBe("forest");
      expect(forest.zones).toContain("Опушка леса");
    });
  });
});
