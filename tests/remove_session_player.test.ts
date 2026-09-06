import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { removeSessionPlayer } from "../src/api/game.js";

vi.mock('../src/api/supabase.js', () => {
  const rpcMock = vi.fn();
  const deleteMock = vi.fn();
  const eqMock = vi.fn();

  const supabaseMock = {
    rpc: rpcMock,
    from: vi.fn(() => ({
      delete: deleteMock.mockReturnValue({
        eq: eqMock,
      }),
    })),
  };

  const invokeFunctionMock = vi.fn();
  return {
    supabase: supabaseMock,
    signOut: vi.fn(),
    invokeFunction: invokeFunctionMock,
  };
});

describe("Migration 034 & Schema Integrity for Removing Players", () => {
  it("034 migration file exists and contains RLS policy and remove_session_player function", () => {
    const migPath = path.resolve(__dirname, "../supabase/migrations/034_creator_can_delete_session_players.sql");
    expect(fs.existsSync(migPath)).toBe(true);

    const content = fs.readFileSync(migPath, "utf8");
    expect(content).toContain("Players: delete own or session host");
    expect(content).toContain("remove_session_player");
    expect(content).toContain("SECURITY DEFINER");
    expect(content).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("supabaseFullSchema.js contains remove_session_player and updated RLS policy", () => {
    const schemaPath = path.resolve(__dirname, "../src/utils/supabaseFullSchema.js");
    const content = fs.readFileSync(schemaPath, "utf8");
    expect(content).toContain("Players: delete own or session host");
    expect(content).toContain("remove_session_player");
  });
});

describe("removeSessionPlayer API", () => {
  it("calls remove_session_player RPC successfully", async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: true, player_id: "player-123" },
      error: null,
    });

    const result = await removeSessionPlayer("sess-1", "player-123");
    expect(supabase.rpc).toHaveBeenCalledWith('remove_session_player', {
      p_session_id: "sess-1",
      p_player_id: "player-123",
    });
    expect(result.success).toBe(true);
    expect(result.player_id).toBe("player-123");
  });

  it("calls manage-player edge function when RPC is missing", async () => {
    const { supabase, invokeFunction } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the function public.remove_session_player" },
    });
    (invokeFunction as any).mockResolvedValueOnce({
      success: true,
      player_id: "player-456",
    });

    const result = await removeSessionPlayer("sess-1", "player-456");
    expect(invokeFunction).toHaveBeenCalledWith('manage-player', {
      action: 'remove_player',
      sessionId: 'sess-1',
      playerId: 'player-456',
    });
    expect(result.success).toBe(true);
    expect(result.player_id).toBe("player-456");
  });

  it("throws error when direct delete deletes 0 rows due to RLS", async () => {
    const { supabase, invokeFunction } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the function public.remove_session_player" },
    });
    (invokeFunction as any).mockRejectedValueOnce(new Error("Edge function unavailable"));

    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    (supabase.from as any).mockReturnValue({ delete: deleteMock });

    await expect(removeSessionPlayer("sess-1", "player-blocked"))
      .rejects.toThrow("операция заблокирована правами RLS");
  });

  it("throws error when RPC returns permission error", async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: false, error: "У вас нет прав на удаление этого участника" },
      error: null,
    });

    await expect(removeSessionPlayer("sess-1", "player-789"))
      .rejects.toThrow("У вас нет прав на удаление этого участника");
  });
});
