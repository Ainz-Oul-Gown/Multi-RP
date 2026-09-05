// tests/world_deletion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteWorld, createSession, getSessions } from '../src/api/game.js';

vi.mock('../src/api/supabase.js', () => {
  const rpcMock = vi.fn();
  const deleteMock = vi.fn();
  const eqMock = vi.fn();
  const selectMock = vi.fn();
  const insertMock = vi.fn();

  const supabaseMock = {
    rpc: rpcMock,
    from: vi.fn((table: string) => ({
      delete: deleteMock.mockReturnValue({
        eq: eqMock,
      }),
      select: selectMock.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Этерия 2.0' }, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: 'sess-1' }, error: null }),
        }),
        order: vi.fn().mockReturnValue({
          data: [
            { id: 'sess-1', world_id: null, world_name: 'Этерия 2.0', created_at: '2026-09-06' }
          ],
          error: null,
        }),
        in: vi.fn().mockReturnValue({ data: [], error: null }),
      }),
      insert: insertMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-sess-1', world_name: 'Этерия 2.0' }, error: null }),
        }),
      }),
    })),
  };

  return {
    supabase: supabaseMock,
    signOut: vi.fn(),
    invokeFunction: vi.fn(),
  };
});

describe('Safe World Deletion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call delete_world RPC and return success statistics', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        deleted_world_id: 'world-123',
        world_name: 'Этерия 2.0',
        preserved_sessions_count: 1,
        deleted_npcs: 151,
        deleted_locations: 72,
        deleted_states: 8,
        deleted_lore: 10,
      },
      error: null,
    });

    const res = await deleteWorld('world-123');
    expect(supabase.rpc).toHaveBeenCalledWith('delete_world', { p_world_id: 'world-123' });
    expect(res).toMatchObject({
      success: true,
      deleted_world_id: 'world-123',
      preserved_sessions_count: 1,
      deleted_npcs: 151,
    });
  });

  it('should fallback to direct delete query if delete_world RPC is missing', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function public.delete_world' },
    });
    const fromMock = supabase.from as any;
    const deleteChain = fromMock('worlds');
    deleteChain.delete().eq.mockResolvedValueOnce({ error: null });

    const res = await deleteWorld('world-fallback');
    expect(supabase.from).toHaveBeenCalledWith('worlds');
    expect(res).toEqual({ success: true, deleted_world_id: 'world-fallback' });
  });

  it('should throw error if RPC returns permission denied error', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'У вас нет прав на удаление этого мира',
      },
      error: null,
    });

    await expect(deleteWorld('world-unauthorized')).rejects.toThrow('У вас нет прав на удаление этого мира');
  });

  it('preserves world_name when getting sessions whose world was deleted', async () => {
    const sessions = await getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].worlds).toEqual({ id: null, name: 'Этерия 2.0' });
  });
});
