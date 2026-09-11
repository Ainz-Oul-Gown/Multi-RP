import { describe, it, expect, vi } from "vitest";
import {
  buildStartingLocationPrompt,
  buildFallbackStartingLocation,
  ensureStartingLocation,
} from "../supabase/functions/_shared/starting_location_generator.ts";
import { formatGameCalendarDate } from "../src/utils/gameDate.js";

describe("Starting Location & Calendar System", () => {
  describe("formatGameCalendarDate", () => {
    it("formats a standard medieval calendar date in Russian", () => {
      const formatted = formatGameCalendarDate(14, 5, 1248, 10, 0);
      expect(formatted).toBe("14 мая 1248 г., 10:00");
    });

    it("formats single-digit hours and minutes with leading zero", () => {
      const formatted = formatGameCalendarDate(1, 1, 1248, 8, 5);
      expect(formatted).toBe("1 января 1248 г., 08:05");
    });

    it("handles different months correctly", () => {
      expect(formatGameCalendarDate(25, 12, 1248, 23, 59)).toBe("25 декабря 1248 г., 23:59");
      expect(formatGameCalendarDate(10, 7, 1248, 12, 30)).toBe("10 июля 1248 г., 12:30");
      expect(formatGameCalendarDate(1, 9, 1248, 6, 0)).toBe("1 сентября 1248 г., 06:00");
    });

    it("returns empty string if required date fields are missing", () => {
      expect(formatGameCalendarDate(null, 5, 1248)).toBe("");
      expect(formatGameCalendarDate(14, null, 1248)).toBe("");
      expect(formatGameCalendarDate(14, 5, null)).toBe("");
    });
  });

  describe("buildFallbackStartingLocation", () => {
    it("generates a tavern when player action text mentions tavern/inn", () => {
      const result = buildFallbackStartingLocation(
        { id: "p1", name: "Роланд", race: "Человек", class: "Воин" },
        "Сижу за столом в таверне и считаю монеты"
      );
      expect(result.location_name).toContain("Таверна");
      expect(result.location_type).toBe("tavern");
      expect(result.state_name).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.initial_npcs.length).toBeGreaterThanOrEqual(1);
      expect(result.game_time.year).toBe(1248);
      expect(result.game_time.month).toBe(5);
      expect(result.game_time.day).toBe(14);
    });

    it("generates wilderness when action text mentions forest/road", () => {
      const result = buildFallbackStartingLocation(
        { id: "p2", name: "Леголас", race: "Эльф", class: "Следопыт" },
        "Иду по лесной тропе сквозь густые заросли"
      );
      expect(result.location_type).toBe("wilderness");
      expect(result.location_name).toBeTruthy();
      expect(result.initial_npcs.length).toBeGreaterThanOrEqual(1);
    });

    it("generates dungeon when action text mentions cave/dungeon", () => {
      const result = buildFallbackStartingLocation(
        { id: "p3", name: "Гимли", race: "Дварф", class: "Воин" },
        "Спускаюсь в темное подземелье с факелом"
      );
      expect(result.location_type).toBe("dungeon");
      expect(result.location_name).toBeTruthy();
    });

    it("generates class-appropriate fallback (Mage in Tower/Academy)", () => {
      const result = buildFallbackStartingLocation(
        { id: "p4", name: "Гэндальф", race: "Человек", class: "Маг" },
        "Осматриваюсь вокруг"
      );
      expect(result.location_type).toBe("landmark");
      expect(result.location_name).toContain("Башня");
    });

    it("provides ambient sounds, visuals, and weather", () => {
      const result = buildFallbackStartingLocation(
        { id: "p1", name: "Арагорн", race: "Человек", class: "Следопыт" },
        "Стою на опушке"
      );
      expect(result.atmosphere.sounds.length).toBeGreaterThan(0);
      expect(result.atmosphere.visuals.length).toBeGreaterThan(0);
      expect(typeof result.weather).toBe("string");
      expect(result.weather.length).toBeGreaterThan(0);
    });
  });

  describe("buildStartingLocationPrompt", () => {
    it("includes character card details and player first action in prompt", () => {
      const prompt = buildStartingLocationPrompt({
        player: {
          name: "Торин",
          race: "Дварф",
          class: "Кузнец",
          appearance: "Густая борода, боевой молот на поясе",
          personality: "Упрямый, честный",
          bio: "Потомок древнего рода кузнецов",
        },
        action_text: "Осматриваю горн и беру в руки молот",
        lore_context: "Королевство Эребор славится своими мастерами",
      });

      expect(prompt).toContain("Торин");
      expect(prompt).toContain("Дварф");
      expect(prompt).toContain("Кузнец");
      expect(prompt).toContain("Густая борода");
      expect(prompt).toContain("Осматриваю горн и беру в руки молот");
      expect(prompt).toContain("Королевство Эребор славится своими мастерами");
      expect(prompt).toContain("1248");
      expect(prompt).toContain("JSON");
    });
  });

  describe("ensureStartingLocation", () => {
    it("returns existing location if session already has current_location_id and is not first turn", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "locations") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "loc-existing",
                  name: "Существующая таверна",
                  states: [{ name: "Старый край" }],
                },
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await ensureStartingLocation({
        supabase: mockSupabase,
        session: {
          id: "sess-1",
          current_location_id: "loc-existing",
          game_year: 1248,
          game_month: 5,
          game_day: 14,
          game_hour: 10,
          game_minute: 0,
        },
        player: { id: "p1", name: "Герой" },
        action_text: "Привет!",
        is_first_turn: false,
      });

      expect(result.is_new_location).toBe(false);
      expect(result.location_id).toBe("loc-existing");
      expect(result.location_name).toBe("Существующая таверна");
      expect(result.state_name).toBe("Старый край");
    });

    it("generates and persists starting location, state, and npcs on first turn when location is missing", async () => {
      const mockState = { id: "state-123", name: "Владения Грифоньего Края" };
      const mockLocation = { id: "loc-123", name: "Таверна 'Пьяный Дракон'" };
      const mockNpc = { id: "npc-123", name: "Трактирщик Барнаби" };

      const insertedRecords: Record<string, any[]> = {
        states: [],
        locations: [],
        npcs: [],
        sessions: [],
      };

      const mockSupabase = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            single: vi.fn().mockResolvedValue({
              data: table === "states" ? mockState : table === "locations" ? mockLocation : mockNpc,
            }),
          })),
          insert: vi.fn((records: any) => {
            const arr = Array.isArray(records) ? records : [records];
            insertedRecords[table].push(...arr);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: table === "states" ? mockState : table === "locations" ? mockLocation : mockNpc,
                }),
              })),
            };
          }),
          update: vi.fn((updates: any) => {
            insertedRecords[table].push(updates);
            return {
              eq: vi.fn().mockResolvedValue({ data: updates, error: null }),
            };
          }),
        })),
      } as any;

      const result = await ensureStartingLocation({
        supabase: mockSupabase,
        session: {
          id: "sess-1",
          current_location_id: null,
          world_id: "world-1",
        },
        player: {
          id: "p1",
          name: "Влад",
          race: "Человек",
          class: "Воин",
        },
        action_text: "Осматриваю таверну и подхожу к стойке",
        is_first_turn: true,
        // No API key -> should use fallback generator safely
      });

      expect(result.is_new_location).toBe(true);
      expect(result.location_id).toBe("loc-123");
      expect(result.location_name).toBe("Таверна 'Пьяный Дракон'");
      expect(result.state_name).toBe("Владения Грифоньего Края");
      expect(result.game_time.year).toBe(1248);

      // Verify states insert
      expect(insertedRecords.states.length).toBeGreaterThanOrEqual(1);
      // Verify locations insert
      expect(insertedRecords.locations.length).toBeGreaterThanOrEqual(1);
      // Verify npcs insert
      expect(insertedRecords.npcs.length).toBeGreaterThanOrEqual(1);
      // Verify session updated with location and time
      expect(insertedRecords.sessions.length).toBeGreaterThanOrEqual(1);
      expect(insertedRecords.sessions[0].current_location_id).toBe("loc-123");
      expect(insertedRecords.sessions[0].game_year).toBe(1248);
    });

    it("includes available world locations and subzones in buildStartingLocationPrompt", () => {
      const prompt = buildStartingLocationPrompt({
        player: { name: "Элрион", race: "Эльф", class: "Следопыт" },
        action_text: "Опиши мое появление в деревушке",
        available_locations: [
          {
            id: "loc-vill-1",
            name: "Зеленая Долина",
            type: "village",
            description: "Уютная деревня на границе Шепчущего леса",
            state_name: "Северные земли",
            subzones: [
              { id: "sz-1", name: "Трактир «У Мельника»", pos_x: 12, pos_y: 34 },
              { id: "sz-2", name: "Старая Мельница", pos_x: 15, pos_y: 38 },
            ],
          },
          {
            id: "loc-cap-1",
            name: "Этерия-Прайм",
            type: "capital",
            description: "Величественная белокаменная столица империи",
            state_name: "Центральный домен",
            subzones: [
              { id: "sz-3", name: "Дворцовая площадь", pos_x: 100, pos_y: 200 },
            ],
          },
        ],
      });

      expect(prompt).toContain("Зеленая Долина");
      expect(prompt).toContain("village");
      expect(prompt).toContain("Трактир «У Мельника»");
      expect(prompt).toContain("Этерия-Прайм");
      expect(prompt).toContain("capital");
      expect(prompt).toContain("ДОСТУПНЫЕ СУЩЕСТВУЮЩИЕ ЛОКАЦИИ МИРА");
      expect(prompt).toContain("selected_subzone");
    });

    it("selects a village and random subzone from available_locations on 'в деревушке'", () => {
      const availableLocations = [
        {
          id: "loc-cap-1",
          name: "Великий Оплот",
          type: "capital",
          state_name: "Королевство",
          subzones: [{ id: "sz-cap", name: "Тронный зал", pos_x: 0, pos_y: 0 }],
        },
        {
          id: "loc-vill-1",
          name: "Дубрава",
          type: "village",
          description: "Лесная тихая деревушка",
          state_name: "Лесной край",
          pos_x: 50,
          pos_y: 60,
          subzones: [
            { id: "sz-v1", name: "Деревенская площадь", pos_x: 52, pos_y: 61 },
            { id: "sz-v2", name: "Кузница кузнеца Болина", pos_x: 55, pos_y: 64 },
          ],
        },
      ];

      const result = buildFallbackStartingLocation(
        { id: "p1", name: "Робин", class: "Лучник" },
        "опиши мое появление в деревушке",
        availableLocations
      );

      expect(result.location_name).toBe("Дубрава");
      expect(result.location_type).toBe("village");
      expect(result.state_name).toBe("Лесной край");
      expect(result.subzone_id).toBeTruthy();
      expect(["sz-v1", "sz-v2"]).toContain(result.subzone_id);
      expect(["Деревенская площадь", "Кузница кузнеца Болина"]).toContain(result.subzone_name);
      expect([52, 55]).toContain(result.pos_x);
      expect([61, 64]).toContain(result.pos_y);
    });

    it("selects a capital from available_locations on 'в столице'", () => {
      const availableLocations = [
        {
          id: "loc-vill-1",
          name: "Речные Островки",
          type: "village",
          state_name: "Пограничье",
        },
        {
          id: "loc-cap-1",
          name: "Цитадель Солнца",
          type: "capital",
          description: "Златоглавая столица верховного владыки",
          state_name: "Солнечные Владения",
          pos_x: 10,
          pos_y: 20,
          subzones: [
            { id: "sz-gate", name: "Главные врата столицы", pos_x: 11, pos_y: 21 },
          ],
        },
      ];

      const result = buildFallbackStartingLocation(
        { id: "p1", name: "Артас", class: "Паладин" },
        "Опиши мое появление в столице",
        availableLocations
      );

      expect(result.location_name).toBe("Цитадель Солнца");
      expect(result.location_type).toBe("capital");
      expect(result.state_name).toBe("Солнечные Владения");
      expect(result.subzone_id).toBe("sz-gate");
      expect(result.subzone_name).toBe("Главные врата столицы");
      expect(result.pos_x).toBe(11);
      expect(result.pos_y).toBe(21);
    });

    it("uses existing DB location without inserting duplicates when available_locations is provided", async () => {
      const insertedRecords: Record<string, any[]> = {
        locations: [],
        states: [],
        sessions: [],
      };

      const mockSupabase = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
          insert: vi.fn((records: any) => {
            const arr = Array.isArray(records) ? records : [records];
            insertedRecords[table].push(...arr);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: "new-id" } }),
              })),
            };
          }),
          update: vi.fn((updates: any) => {
            insertedRecords[table].push(updates);
            return {
              eq: vi.fn().mockResolvedValue({ data: updates, error: null }),
            };
          }),
        })),
      } as any;

      const availableLocations = [
        {
          id: "db-village-42",
          name: "Сосновый Бор",
          type: "village",
          description: "Деревня лесорубов",
          state_name: "Хвойный Предел",
          pos_x: -30,
          pos_y: 40,
          subzones: [
            { id: "sz-wood-1", name: "Лесопилка", pos_x: -28, pos_y: 42 },
          ],
        },
      ];

      const result = await ensureStartingLocation({
        supabase: mockSupabase,
        session: { id: "sess-test-1", current_location_id: null, world_id: "world-1" },
        player: { id: "p1", name: "Василий", class: "Дровосек" },
        action_text: "Опиши мое появление в тихой деревушке на лесопилке",
        is_first_turn: true,
        available_locations: availableLocations,
      });

      expect(result).not.toBeNull();
      expect(result?.is_new_location).toBe(false);
      expect(result?.location_id).toBe("db-village-42");
      expect(result?.location_name).toBe("Сосновый Бор");
      expect(result?.location_type).toBe("village");
      expect(result?.subzone_id).toBe("sz-wood-1");
      expect(result?.subzone_name).toBe("Лесопилка");
      expect(result?.pos_x).toBe(-28);
      expect(result?.pos_y).toBe(42);

      // CRITICAL: Ensure NO new location was inserted into the database!
      expect(insertedRecords.locations.length).toBe(0);
      expect(insertedRecords.states.length).toBe(0);

      // Session current_location_id must be updated to the existing location
      expect(insertedRecords.sessions.length).toBeGreaterThanOrEqual(1);
      expect(insertedRecords.sessions[0].current_location_id).toBe("db-village-42");
    });
  });
});

