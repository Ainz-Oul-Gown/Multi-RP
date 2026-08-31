import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем все зависимости до импорта модуля
const mockSupabaseFrom = vi.fn();
const mockSupabase = {
  from: mockSupabaseFrom,
};

// Мокаем все импорты модуля
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => mockSupabase,
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
  // Для await цепочки - возвращаем промис
  Object.defineProperty(chain, 'then', {
    get() {
      return (resolve: any) => resolve(returnValue);
    },
  });
  return chain;
}

describe("npc-memory-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should add vivid memory and vectorize it", async () => {
    // Настраиваем мок для from()
    const playerChain = createSupabaseChain({ data: { user_id: "user-123" } });
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });
    const insertChain = createSupabaseChain({ error: null });
    const countVividChain = createSupabaseChain({ count: 1, error: null });
    const countMediumChain = createSupabaseChain({ count: 0, error: null });
    const countBeliefChain = createSupabaseChain({ count: 0, error: null });

    mockSupabaseFrom
      .mockReturnValueOnce(playerChain) // players
      .mockReturnValueOnce(settingsChain) // user_settings
      .mockReturnValueOnce(insertChain) // npc_memories insert
      .mockReturnValueOnce(countVividChain) // npc_memories count vivid
      .mockReturnValueOnce(countMediumChain) // npc_memories count medium
      .mockReturnValueOnce(countBeliefChain); // npc_memories count belief

    // Мокаем успешный ответ от embeddings API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.1) }],
      }),
    });

    // Динамически импортируем модуль (он зарегистрирует serve)
    await import("../supabase/functions/npc-memory-engine/index.ts");

    // Получаем зарегистрированный serve handler
    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    // Создаем тестовый запрос
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc_id: "npc-123",
        player_id: "player-456",
        memory_text: "Тестовое воспоминание",
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    // Проверяем что вызывался fetch к embeddings
    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("bge-m3"),
      }),
    );

    // Проверяем что вызывался insert со статусом vivid
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        npc_id: "npc-123",
        player_id: "player-456",
        memory_text: "Тестовое воспоминание",
        memory_type: "vivid",
        embedding: expect.any(Array),
      }),
    );

    expect(body.success).toBe(true);
  });

  it("should cascade vivid to medium when count > 5", async () => {
    // Настраиваем мок для from()
    const playerChain = createSupabaseChain({ data: { user_id: "user-123" } });
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });
    const insertChain = createSupabaseChain({ error: null });
    const countVividChain = createSupabaseChain({ count: 6, error: null });
    const oldestVividChain = createSupabaseChain({ data: { id: "oldest-vivid-id" } });
    const updateChain = createSupabaseChain({ error: null });
    const countMediumChain = createSupabaseChain({ count: 0, error: null });
    const countBeliefChain = createSupabaseChain({ count: 0, error: null });

    mockSupabaseFrom
      .mockReturnValueOnce(playerChain) // players
      .mockReturnValueOnce(settingsChain) // user_settings
      .mockReturnValueOnce(insertChain) // npc_memories insert
      .mockReturnValueOnce(countVividChain) // npc_memories count vivid
      .mockReturnValueOnce(oldestVividChain) // oldest vivid
      .mockReturnValueOnce(updateChain) // update to medium
      .mockReturnValueOnce(countMediumChain) // npc_memories count medium
      .mockReturnValueOnce(countBeliefChain); // npc_memories count belief

    // Мокаем успешный ответ от embeddings API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.1) }],
      }),
    });

    await import("../supabase/functions/npc-memory-engine/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc_id: "npc-123",
        player_id: "player-456",
        memory_text: "Тестовое воспоминание",
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    // Проверяем что вызывался update для перемещения в medium
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ memory_type: "medium" }),
    );

    expect(body.success).toBe(true);
  });

  it("should compress medium to belief and update status tags", async () => {
    // Настраиваем мок для from()
    const playerChain = createSupabaseChain({ data: { user_id: "user-123" } });
    const settingsChain = createSupabaseChain({ data: { openrouter_key: "test-key" } });
    const insertVividChain = createSupabaseChain({ error: null });
    const countVividChain = createSupabaseChain({ count: 1, error: null });
    const countMediumChain = createSupabaseChain({ count: 6, error: null });
    const mediumMemoriesChain = createSupabaseChain({
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `medium-${i}`,
        memory_text: `Воспоминание ${i + 1}`,
      })),
      error: null,
    });
    const deleteChain = createSupabaseChain({ error: null });
    const insertBeliefChain = createSupabaseChain({ error: null });
    const countBeliefChain = createSupabaseChain({ count: 1, error: null });
    const npcDataChain = createSupabaseChain({ data: { status_tags: ["знакомый"] } });
    const updateTagsChain = createSupabaseChain({ error: null });

    mockSupabaseFrom
      .mockReturnValueOnce(playerChain) // players
      .mockReturnValueOnce(settingsChain) // user_settings
      .mockReturnValueOnce(insertVividChain) // npc_memories insert vivid
      .mockReturnValueOnce(countVividChain) // npc_memories count vivid
      .mockReturnValueOnce(countMediumChain) // npc_memories count medium
      .mockReturnValueOnce(mediumMemoriesChain) // get 6 medium memories
      .mockReturnValueOnce(deleteChain) // delete 6 medium
      .mockReturnValueOnce(insertBeliefChain) // insert belief
      .mockReturnValueOnce(countBeliefChain) // npc_memories count belief
      .mockReturnValueOnce(npcDataChain) // get npc status_tags
      .mockReturnValueOnce(updateTagsChain); // update status_tags

    // Мокаем успешный ответ от embeddings API для первого воспоминания
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.1) }],
      }),
    });

    // Мокаем вызов LLM для сжатия (chat/completions)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Игрок — надёжный союзник" } }],
      }),
    });

    // Мокаем генерацию эмбеддинга для belief
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.2) }],
      }),
    });

    // Мокаем вызов LLM для обновления тегов (chat/completions)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"tags": ["друг", "наставник"]}' } }],
      }),
    });

    await import("../supabase/functions/npc-memory-engine/index.ts");

    const { serve } = await import("https://deno.land/std@0.177.0/http/server.ts");
    const handler = (serve as any).mock.calls[0][0];

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc_id: "npc-123",
        player_id: "player-456",
        memory_text: "Тестовое воспоминание",
      }),
    });

    const res = await handler(req);
    const body = await res.json();

    // Проверяем что вызывались два fetch-запроса к chat/completions
    const chatCalls = mockFetch.mock.calls.filter(
      (call) => call[0] === "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(chatCalls.length).toBe(2);

    // Проверяем что произошло удаление 6 записей
    expect(deleteChain.delete).toHaveBeenCalled();

    // Проверяем что вставился belief
    expect(insertBeliefChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        memory_type: "belief",
        memory_text: "Игрок — надёжный союзник",
      }),
    );

    // Проверяем что обновились status_tags
    expect(updateTagsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status_tags: ["друг", "наставник"] }),
    );

    expect(body.success).toBe(true);
    expect(body.new_belief_created).toBe(true);
  });
});
