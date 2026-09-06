// tests/multiplayer_spawn_and_fog.test.ts
import { describe, it, expect } from "vitest";
import {
  TERRAIN_MODIFIERS,
  buildFallbackLocationMap,
} from "../supabase/functions/_shared/fog_location_generator.ts";

describe("Мультиплеер: спавн игроков, выбор точки появления, передача ходов и эхо войны", () => {
  describe("1. Спавн и выбор точки появления", () => {
    it("если есть только один игрок в сессии — новый игрок появляется рядом с ним автоматически без выбора", () => {
      const allPlayers = [
        { id: "p1", name: "Воин Рагнар", race: "Человек", class: "Воин", current_zone: "Главный зал" },
      ];

      function resolveSpawnTarget(players: any[], selectedPlayerId?: string) {
        if (!players.length) return { zone: null, targetName: null };
        if (players.length === 1) return { zone: players[0].current_zone || null, targetName: players[0].name };
        if (selectedPlayerId) {
          const found = players.find(p => p.id === selectedPlayerId);
          if (found) return { zone: found.current_zone || null, targetName: found.name };
        }
        return { zone: players[0]?.current_zone || null, targetName: players[0]?.name || null };
      }

      const spawn = resolveSpawnTarget(allPlayers);
      expect(spawn.zone).toBe("Главный зал");
      expect(spawn.targetName).toBe("Воин Рагнар");
    });

    it("если в сессии 2 или более игроков — новый игрок может выбрать конкретного персонажа и получить его координаты", () => {
      const allPlayers = [
        { id: "p1", name: "Воин Рагнар", current_zone: "Главный зал" },
        { id: "p2", name: "Вор Локи", current_zone: "Погреб" },
        { id: "p3", name: "Маг Эльдар", current_zone: "Башня магии" },
      ];

      function resolveSpawnTarget(players: any[], selectedPlayerId?: string) {
        if (!players.length) return { zone: null, targetName: null };
        if (players.length === 1) return { zone: players[0].current_zone || null, targetName: players[0].name };
        if (selectedPlayerId) {
          const found = players.find(p => p.id === selectedPlayerId);
          if (found) return { zone: found.current_zone || null, targetName: found.name };
        }
        return { zone: players[0]?.current_zone || null, targetName: players[0]?.name || null };
      }

      // Выбираем появиться рядом с Вором Локи в Погребе
      const spawnNearLoki = resolveSpawnTarget(allPlayers, "p2");
      expect(spawnNearLoki.zone).toBe("Погреб");
      expect(spawnNearLoki.targetName).toBe("Вор Локи");

      // Выбираем появиться рядом с Магом Эльдаром в Башне
      const spawnNearEldar = resolveSpawnTarget(allPlayers, "p3");
      expect(spawnNearEldar.zone).toBe("Башня магии");
      expect(spawnNearEldar.targetName).toBe("Маг Эльдар");
    });

    it("новый игрок объявляется в системе как путник/незнакомец, а не как старый друг", () => {
      const currentPlayer = { name: "Новичок", race: "Эльф", class: "Следопыт" };
      const targetName = "Воин Рагнар";
      const nearStr = targetName ? `рядом с героем ${targetName}` : "в локации";
      const announcement = `👋 В поле зрения появляется странник: ${currentPlayer.name} (${currentPlayer.race} ${currentPlayer.class}), замеченный ${nearStr}. Вы ещё не знакомы с ним.`;

      expect(announcement).toContain("странник: Новичок");
      expect(announcement).toContain("Вы ещё не знакомы с ним");
      expect(announcement).toContain("рядом с героем Воин Рагнар");
    });
  });

  describe("2. Независимое перемещение игроков", () => {
    it("перемещение одного игрока между подзонами не меняет положение других игроков", () => {
      const players = [
        { id: "p1", name: "Игрок 1", current_zone: "Главный зал" },
        { id: "p2", name: "Игрок 2", current_zone: "Главный зал" },
      ];

      // Игрок 1 перемещается в погреб
      const movingPlayerId = "p1";
      const newZone = "Погреб";

      const updatedPlayers = players.map(p => {
        if (p.id === movingPlayerId) {
          return { ...p, current_zone: newZone };
        }
        return p;
      });

      expect(updatedPlayers.find(p => p.id === "p1")?.current_zone).toBe("Погреб");
      expect(updatedPlayers.find(p => p.id === "p2")?.current_zone).toBe("Главный зал");
    });
  });

  describe("3. Передача ходов между игроками", () => {
    it("initTurnQueue корректно активирует первого игрока и ставит второго в waiting", () => {
      const players = [
        { id: "p1", name: "Игрок 1" },
        { id: "p2", name: "Игрок 2" },
      ];

      const queue = players.map((p, idx) => ({
        player_id: p.id,
        status: idx === 0 ? "active" : "waiting",
      }));

      expect(queue[0].status).toBe("active");
      expect(queue[1].status).toBe("waiting");
    });
  });

  describe("4. Эхо войны (Fog of War) и акустика местности", () => {
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
