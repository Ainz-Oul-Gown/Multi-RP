// tests/multiplayer_turn_queue.test.ts
// Тесты для многопользовательского режима: очередь ходов, ротация раундов, подключение игроков и туман войны
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Мокаем Supabase Client через vi.hoisted
// ============================================
const { mockSupabase, dbState } = vi.hoisted(() => {
  const dbState = {
    turnQueue: [] as any[],
  };

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "turn_queue") {
        return {
          select: vi.fn((cols: string = "*") => {
            return {
              eq: vi.fn(function (field: string, val: any) {
                const queryState: any = {
                  filters: [{ field, val }],
                  orderBy: null,
                  isLimit: null,
                };

                const chain = {
                  eq: vi.fn(function (f2: string, v2: any) {
                    queryState.filters.push({ field: f2, val: v2 });
                    return chain;
                  }),
                  order: vi.fn(function (orderCol: string, opts?: any) {
                    queryState.orderBy = { col: orderCol, asc: opts?.ascending ?? true };
                    return chain;
                  }),
                  limit: vi.fn(function (n: number) {
                    queryState.isLimit = n;
                    return chain;
                  }),
                  maybeSingle: vi.fn(async function () {
                    let filtered = [...dbState.turnQueue];
                    for (const f of queryState.filters) {
                      filtered = filtered.filter((row) => row[f.field] === f.val);
                    }
                    return { data: filtered[0] || null, error: null };
                  }),
                  single: vi.fn(async function () {
                    let filtered = [...dbState.turnQueue];
                    for (const f of queryState.filters) {
                      filtered = filtered.filter((row) => row[f.field] === f.val);
                    }
                    if (!filtered.length) {
                      return { data: null, error: { code: "PGRST116", message: "No rows found" } };
                    }
                    return { data: filtered[0], error: null };
                  }),
                  then: (resolve: any) => {
                    let filtered = [...dbState.turnQueue];
                    for (const f of queryState.filters) {
                      filtered = filtered.filter((row) => row[f.field] === f.val);
                    }
                    resolve({ data: filtered, error: null });
                  },
                };
                return chain;
              }),
              order: vi.fn(function (orderCol: string, opts?: any) {
                let filtered = [...dbState.turnQueue];
                return {
                  then: (resolve: any) => resolve({ data: filtered, error: null }),
                };
              }),
            };
          }),
          insert: vi.fn((rows: any | any[]) => {
            const toAdd = Array.isArray(rows) ? rows : [rows];
            const inserted = toAdd.map((r, i) => ({
              id: r.id || `turn-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              created_at: new Date().toISOString(),
              ...r,
            }));
            dbState.turnQueue.push(...inserted);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: inserted[0] || null, error: null })),
                then: (resolve: any) => resolve({ data: inserted, error: null }),
              })),
              then: (resolve: any) => resolve({ data: inserted, error: null }),
            };
          }),
          update: vi.fn((patch: any) => {
            const filters: Array<{ field: string; val: any }> = [];
            let inFilter: { field: string; vals: any[] } | undefined;

            const executeUpdate = () => {
              const updatedRows: any[] = [];
              for (const row of dbState.turnQueue) {
                const matchFilters = filters.every((f) => row[f.field] === f.val);
                const matchIn = inFilter ? inFilter.vals.includes(row[inFilter.field]) : true;
                if (matchFilters && matchIn) {
                  Object.assign(row, patch);
                  updatedRows.push(row);
                }
              }
              return updatedRows;
            };

            const updateChain: any = {
              eq: vi.fn((field: string, val: any) => {
                filters.push({ field, val });
                return updateChain;
              }),
              in: vi.fn((field: string, vals: any[]) => {
                inFilter = { field, vals };
                return updateChain;
              }),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const updated = executeUpdate();
                  return { data: updated[0] || null, error: null };
                }),
              })),
              then: (resolve: any) => {
                executeUpdate();
                resolve({ data: null, error: null });
              },
            };
            return updateChain;
          }),
        };
      }
      return {};
    }),
  };

  return { mockSupabase, dbState };
});

vi.mock("../src/api/supabase.js", () => ({
  supabase: mockSupabase,
  invokeFunction: vi.fn(),
  subscribeToSessionMessages: vi.fn(),
  subscribeToSessionPlayers: vi.fn(),
}));

import { initTurnQueue, getCurrentTurn, getTurnQueue, passTurn } from "../src/api/game.js";

describe("Multiplayer: Turn Queue Lifecycle", () => {
  beforeEach(() => {
    dbState.turnQueue = [];
    vi.clearAllMocks();
  });

  it("initTurnQueue создает очередь для игроков (первый active, второй waiting)", async () => {
    const players = [
      { id: "player-1", name: "Арагорн" },
      { id: "player-2", name: "Леголас" },
    ];

    const activeTurn = await initTurnQueue("session-1", players);

    expect(activeTurn).toBeTruthy();
    expect(activeTurn.player_id).toBe("player-1");
    expect(activeTurn.status).toBe("active");

    const queue = await getTurnQueue("session-1");
    expect(queue.length).toBe(2);
    expect(queue[0].player_id).toBe("player-1");
    expect(queue[0].status).toBe("active");
    expect(queue[1].player_id).toBe("player-2");
    expect(queue[1].status).toBe("waiting");
  });

  it("initTurnQueue возвращает существующий активный ход без дублирования", async () => {
    dbState.turnQueue = [
      { id: "t1", session_id: "session-1", player_id: "player-1", status: "active", created_at: "2026-09-01T10:00:00Z" },
      { id: "t2", session_id: "session-1", player_id: "player-2", status: "waiting", created_at: "2026-09-01T10:01:00Z" },
    ];

    const players = [
      { id: "player-1", name: "Арагорн" },
      { id: "player-2", name: "Леголас" },
    ];

    const activeTurn = await initTurnQueue("session-1", players);
    expect(activeTurn.player_id).toBe("player-1");
    expect(dbState.turnQueue.length).toBe(2);
  });

  it("initTurnQueue регистрирует нового игрока, зашедшего позже, со статусом waiting", async () => {
    dbState.turnQueue = [
      { id: "t1", session_id: "session-1", player_id: "player-1", status: "active", created_at: "2026-09-01T10:00:00Z" },
      { id: "t2", session_id: "session-1", player_id: "player-2", status: "waiting", created_at: "2026-09-01T10:01:00Z" },
    ];

    const playersWithNewcomer = [
      { id: "player-1", name: "Арагорн" },
      { id: "player-2", name: "Леголас" },
      { id: "player-3", name: "Гимли" },
    ];

    await initTurnQueue("session-1", playersWithNewcomer);

    expect(dbState.turnQueue.length).toBe(3);
    const gimliTurn = dbState.turnQueue.find((t) => t.player_id === "player-3");
    expect(gimliTurn).toBeTruthy();
    expect(gimliTurn.status).toBe("waiting");
  });

  it("initTurnQueue перезапускает раунд, если все ходы были завершены", async () => {
    dbState.turnQueue = [
      { id: "t1", session_id: "session-1", player_id: "player-1", status: "completed", created_at: "2026-09-01T10:00:00Z" },
      { id: "t2", session_id: "session-1", player_id: "player-2", status: "completed", created_at: "2026-09-01T10:01:00Z" },
    ];

    const players = [
      { id: "player-1", name: "Арагорн" },
      { id: "player-2", name: "Леголас" },
    ];

    const nextRoundTurn = await initTurnQueue("session-1", players);

    expect(nextRoundTurn).toBeTruthy();
    expect(dbState.turnQueue.find((t) => t.id === "t1")?.status).toBe("active");
    expect(dbState.turnQueue.find((t) => t.id === "t2")?.status).toBe("waiting");
  });

  it("passTurn передает ход целевому игроку", async () => {
    dbState.turnQueue = [
      { id: "t1", session_id: "session-1", player_id: "player-1", status: "active", created_at: "2026-09-01T10:00:00Z" },
      { id: "t2", session_id: "session-1", player_id: "player-2", status: "waiting", created_at: "2026-09-01T10:01:00Z" },
    ];

    await passTurn("session-1", "player-2");

    const t1 = dbState.turnQueue.find((t) => t.id === "t1");
    const t2 = dbState.turnQueue.find((t) => t.id === "t2");
    expect(t1?.status).toBe("waiting");
    expect(t2?.status).toBe("active");
  });
});

describe("Multiplayer: Fog of War Visibility", () => {
  // Эмуляция функции isMessageVisibleToCurrentPlayer из game.js
  function isMessageVisibleToCurrentPlayer(msg: any, currentUserId: string, currentPlayerId: string): boolean {
    if (!msg) return false;
    if (msg.sender_type === "system") return true;
    if (msg.sender_type === "player") {
      return msg.sender_id === currentUserId;
    }
    if (msg.sender_type === "master") {
      if (msg.metadata?.is_global === true) {
        if (msg.metadata?.initiator_player_id && currentPlayerId && msg.metadata.initiator_player_id === currentPlayerId) {
          return false;
        }
        return true;
      }
      const targetPlayerId = msg.metadata?.target_player_id;
      if (!targetPlayerId) return true;
      return targetPlayerId === currentPlayerId;
    }
    return false;
  }

  const userA = { id: "user-a", playerId: "player-a" };
  const userB = { id: "user-b", playerId: "player-b" };

  it("автор видит свой отправленный экшен, а напарник — нет", () => {
    const playerActionMsg = {
      sender_type: "player",
      sender_id: userA.id,
      content: "Я крадусь за спину стражника",
    };

    expect(isMessageVisibleToCurrentPlayer(playerActionMsg, userA.id, userA.playerId)).toBe(true);
    expect(isMessageVisibleToCurrentPlayer(playerActionMsg, userB.id, userB.playerId)).toBe(false);
  });

  it("персональный нарратив виден только адресату", () => {
    const narrativeMsg = {
      sender_type: "master",
      content: "Вы бесшумно заходите со спины и наносите критический удар.",
      metadata: { target_player_id: "player-a" },
    };

    expect(isMessageVisibleToCurrentPlayer(narrativeMsg, userA.id, userA.playerId)).toBe(true);
    expect(isMessageVisibleToCurrentPlayer(narrativeMsg, userB.id, userB.playerId)).toBe(false);
  });

  it("общий лог комнаты (global_log) виден напарнику, но скрыт от инициатора чтобы избежать дублирования", () => {
    const globalLogMsg = {
      sender_type: "master",
      content: "Внезапно раздаётся лязг стали и крик стражника.",
      metadata: { is_global: true, initiator_player_id: "player-a" },
    };

    expect(isMessageVisibleToCurrentPlayer(globalLogMsg, userB.id, userB.playerId)).toBe(true);
    expect(isMessageVisibleToCurrentPlayer(globalLogMsg, userA.id, userA.playerId)).toBe(false);
  });

  it("системные сообщения видны всем игрокам", () => {
    const sysMsg = {
      sender_type: "system",
      content: "Игрок присоединился к сессии",
    };

    expect(isMessageVisibleToCurrentPlayer(sysMsg, userA.id, userA.playerId)).toBe(true);
    expect(isMessageVisibleToCurrentPlayer(sysMsg, userB.id, userB.playerId)).toBe(true);
  });
});
