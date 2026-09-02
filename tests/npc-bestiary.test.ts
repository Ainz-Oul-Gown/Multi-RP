import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Unit tests for NPC Bestiary & Generation
// ============================================

// Мокаем Supabase клиент
const mockSupabaseFrom = vi.fn();
const mockSupabase = {
  from: mockSupabaseFrom,
  rpc: vi.fn(),
};

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => mockSupabase,
}));

// Мокаем supabase.js для api/game.js
vi.mock("../src/api/supabase.js", () => ({
  supabase: mockSupabase,
  signOut: vi.fn(),
  invokeFunction: vi.fn(),
}));

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

// Мокаем fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Мокаем Deno.env
vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      if (key === "OPENROUTER_API_KEY") return "test-api-key";
      return null;
    }),
  },
});

// Хелпер для создания цепочки моков Supabase
function createSupabaseChain(returnValue: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
  };
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: any) => resolve(returnValue);
    },
  });
  return chain;
}

describe("generate-world-npcs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
    mockSupabase.rpc.mockReset();
    mockFetch.mockReset();
  });

  it("should clean and insert npcs into database", async () => {
    // Мокаем insert NPC
    const insertChain = createSupabaseChain({
      data: [{ id: "npc-1", name: "Дракон", tier: 3 }],
      error: null,
    });

    // Нужен только один мок на insert в таблицу npcs
    mockSupabaseFrom.mockReturnValueOnce(insertChain);

    await import("../supabase/functions/generate-world-npcs/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        world_id: "world-123",
        npcs: [{
          name: "Дракон",
          role: "main",
          race: "Дракон",
          tier: 3,
          stats: { STR: 16, DEX: 14, CON: 16, INT: 14, WIS: 16, CHA: 14 },
          hp: 50,
          max_hp: 50,
        }],
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(insertChain.insert).toHaveBeenCalled();
  });
});

describe("NPC Bestiary API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset(); // <--- СБРАСЫВАЕТ ОЧЕРЕДЬ once-значений!
    mockSupabase.rpc.mockReset();
    mockFetch.mockReset();
  });

  it("should call updateNpc API method", async () => {
    const updateChain = createSupabaseChain({ data: { id: "npc-1", name: "Новое имя" }, error: null });
    mockSupabaseFrom.mockReturnValue(updateChain);

    const { updateNpc } = await import("../src/api/game.js");

    const result = await updateNpc("npc-1", { name: "Новое имя", race: "Эльф" });

    expect(mockSupabaseFrom).toHaveBeenCalledWith("npcs");
    expect(updateChain.update).toHaveBeenCalledWith({ name: "Новое имя", race: "Эльф" });
    expect(result.name).toBe("Новое имя");
  });

  it("should call deleteNpc API method", async () => {
    const deleteChain = createSupabaseChain({ error: null });
    mockSupabaseFrom.mockReturnValue(deleteChain);

    const { deleteNpc } = await import("../src/api/game.js");

    await deleteNpc("npc-1");

    expect(mockSupabaseFrom).toHaveBeenCalledWith("npcs");
    expect(deleteChain.delete).toHaveBeenCalled();
  });

  it("should call getNpcsByWorld API method", async () => {
    const selectChain = createSupabaseChain({ data: [{ id: "npc-1" }, { id: "npc-2" }], error: null });
    mockSupabaseFrom.mockReturnValue(selectChain);

    const { getNpcsByWorld } = await import("../src/api/game.js");

    const result = await getNpcsByWorld("world-123");

    expect(mockSupabaseFrom).toHaveBeenCalledWith("npcs");
    expect(selectChain.eq).toHaveBeenCalledWith("world_id", "world-123");
    expect(result.length).toBe(2);
  });

  it("should preserve new NPC fields on update (class, tier, is_unique, level_min, level_max)", async () => {
    const updateChain = createSupabaseChain({
      data: {
        id: "npc-1",
        name: "Дракон",
        class: "Воин",
        tier: 4,
        is_unique: true,
        level_min: 50,
        level_max: 100,
      },
      error: null,
    });
    mockSupabaseFrom.mockReturnValue(updateChain);

    const { updateNpc } = await import("../src/api/game.js");

    const result = await updateNpc("npc-1", {
      name: "Дракон",
      class: "Воин",
      tier: 4,
      is_unique: true,
      level_min: 50,
      level_max: 100,
    });

    expect(mockSupabaseFrom).toHaveBeenCalledWith("npcs");
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      name: "Дракон",
      class: "Воин",
      tier: 4,
      is_unique: true,
      level_min: 50,
      level_max: 100,
    }));
    expect(result.class).toBe("Воин");
    expect(result.tier).toBe(4);
    expect(result.is_unique).toBe(true);
  });
});

describe("simulate-npc-background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSupabaseFrom.mockReset();
    mockSupabase.rpc.mockReset();
    mockFetch.mockReset();
  });

  it("should autonomously add item to npc inventory", async () => {
    // Мокаем получение сессии
    const sessionChain = createSupabaseChain({ data: { world_id: "world-123" } });
    // Мокаем получение главных NPC
    const npcsChain = createSupabaseChain({
      data: [{
        id: "npc-1",
        name: "Король",
        role: "main",
        race: "Человек",
        background: "Правитель",
        habits: ["читать"],
      }],
    });
    // Мокаем user_settings
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });

    mockSupabaseFrom
      .mockReturnValueOnce(sessionChain) // sessions
      .mockReturnValueOnce(npcsChain) // npcs
      .mockReturnValueOnce(settingsChain); // user_settings

    // Мокаем ответ LLM с предметом
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              action_summary: "Король нашёл древний меч в подземелье",
              obtained_item_name: "Древний меч",
              item_type: "weapon",
            }),
          },
        }],
      }),
    });

    // Мокаем rpc add_item_to_inventory
    mockSupabase.rpc.mockResolvedValueOnce({ data: "item-id", error: null });

    await import("../supabase/functions/simulate-npc-background/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "session-123",
        days_passed: 7,
        user_id: "user-123",
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    // Проверяем что вызывался fetch к chat/completions
    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );

    // Проверяем что вызывался rpc add_item_to_inventory
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "add_item_to_inventory",
      expect.objectContaining({
        p_npc_id: "npc-1",
        p_item_name: "Древний меч",
        p_type: "weapon",
      }),
    );

    expect(body.success).toBe(true);
    expect(body.actions.length).toBe(1);
    expect(body.actions[0].obtained_item_name).toBe("Древний меч");
  });

  it("should not add item when obtained_item_name is null", async () => {
    // Мокаем получение сессии
    const sessionChain = createSupabaseChain({ data: { world_id: "world-123" } });
    // Мокаем получение главных NPC
    const npcsChain = createSupabaseChain({
      data: [{
        id: "npc-1",
        name: "Король",
        role: "main",
        race: "Человек",
        background: "Правитель",
        habits: ["читать"],
      }],
    });
    // Мокаем user_settings
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });

    mockSupabaseFrom
      .mockReturnValueOnce(sessionChain) // sessions
      .mockReturnValueOnce(npcsChain) // npcs
      .mockReturnValueOnce(settingsChain); // user_settings

    // Мокаем ответ LLM без предмета
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              action_summary: "Король провёл день в библиотеке",
              obtained_item_name: null,
              item_type: null,
            }),
          },
        }],
      }),
    });

    await import("../supabase/functions/simulate-npc-background/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "session-123",
        days_passed: 3,
        user_id: "user-123",
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    // Проверяем что rpc add_item_to_inventory НЕ вызывался
    expect(mockSupabase.rpc).not.toHaveBeenCalled();

    expect(body.success).toBe(true);
    expect(body.actions.length).toBe(1);
    expect(body.actions[0].obtained_item_name).toBeNull();
  });
});

describe("NPC Export/Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include new fields in export (class, tier, is_unique, level_min, level_max)", async () => {
    // Мокаем получение мира
    const worldChain = createSupabaseChain({
      data: { id: "world-123", name: "Тестовый мир", settings: {}, description: "" },
    });
    // Мокаем получение lore_files
    const loreChain = createSupabaseChain({ data: [] });
    // Мокаем получение folders
    const foldersChain = createSupabaseChain({ data: [] });
    // Мокаем получение states
    const statesChain = createSupabaseChain({ data: [] });
    // Мокаем получение npcs
    const npcsChain = createSupabaseChain({
      data: [{
        id: "npc-1",
        name: "Дракон",
        race: "Дракон",
        class: "Воин",
        category: "boss",
        role: "main",
        appearance: "Огненный дракон",
        background: "Древний",
        stats: { STR: 20, DEX: 14, CON: 18, INT: 16, WIS: 14, CHA: 12 },
        level: 80,
        tier: 5,
        hit_dice: 12,
        level_min: 50,
        level_max: 100,
        status_tags: ["уникальный"],
        habits: ["летать"],
        catchphrases: ["Я огонь"],
        location_id: null,
        state_id: "state-1",
        special_attacks: [{ name: "Огненное дыхание", damage_type: "fire", damage_dice: "4d6" }],
        base_attacks: [{ name: "Удар хвостом", damage_type: "bludgeoning", damage_dice: "2d8" }],
        is_pack_instance: false,
        pack_size: 1,
        is_unique: true,
      }],
      error: null,
    });

    mockSupabaseFrom
      .mockReturnValueOnce(worldChain) // worlds
      .mockReturnValueOnce(loreChain) // lore_files
      .mockReturnValueOnce(foldersChain) // lore_files folders
      .mockReturnValueOnce(statesChain) // states
      .mockReturnValueOnce(npcsChain); // npcs

    const { exportWorld } = await import("../src/api/game.js");

    const result = await exportWorld("world-123");

    expect(result.bestiary.npcs[0].class).toBe("Воин");
    expect(result.bestiary.npcs[0].tier).toBe(5);
    expect(result.bestiary.npcs[0].is_unique).toBe(true);
    expect(result.bestiary.npcs[0].level_min).toBe(50);
    expect(result.bestiary.npcs[0].level_max).toBe(100);
  });
});
