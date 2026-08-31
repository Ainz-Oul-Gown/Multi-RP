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
    vi.resetModules();
  });

  it("should parse and generate full stats via tier matrix", async () => {
    // Мокаем получение user_settings
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });
    // Мокаем insert NPC
    const insertChain = createSupabaseChain({
      data: [{ id: "npc-1", name: "Дракон", tier: 3 }],
      error: null,
    });

    mockSupabaseFrom
      .mockReturnValueOnce(settingsChain) // user_settings
      .mockReturnValueOnce(insertChain); // npcs insert

    // Мокаем ответ LLM с NPC Tier 3 (HP: 50)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              name: "Дракон",
              role: "main",
              race: "Дракон",
              background: "Древний дракон",
              habits: ["летать"],
              catchphrases: ["Я огонь"],
              tier: 3,
              stats: { STR: 16, DEX: 14, CON: 16, INT: 14, WIS: 16, CHA: 14 },
              hp: 50,
              max_hp: 50,
            }]),
          },
        }],
      }),
    });

    await import("../supabase/functions/generate-world-npcs/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        world_id: "world-123",
        lore_text: "В мире живёт древний дракон",
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
        body: expect.stringContaining("Tier"),
      }),
    );

    // Проверяем что insert был вызван с правильными данными
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          world_id: "world-123",
          name: "Дракон",
          role: "main",
          race: "Дракон",
          background: "Древний дракон",
          stats: { STR: 16, DEX: 14, CON: 16, INT: 14, WIS: 16, CHA: 14 },
          hp: 50,
          max_hp: 50,
        }),
      ]),
    );

    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
  });
});

describe("NPC Bestiary API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

describe("simulate-npc-background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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
