// tests/session_deletion.test.ts
import { describe, it, expect, vi } from 'vitest';
import { deleteSession } from '../src/api/game.js';

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

  return {
    supabase: supabaseMock,
    signOut: vi.fn(),
    invokeFunction: vi.fn(),
  };
});

describe('deleteSession API', () => {
  it('should call delete_session RPC and return success', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: true, deleted_session_id: 'sess-123' },
      error: null,
    });

    const res = await deleteSession('sess-123');
    expect(supabase.rpc).toHaveBeenCalledWith('delete_session', { p_session_id: 'sess-123' });
    expect(res).toEqual({ success: true, deleted_session_id: 'sess-123' });
  });

  it('should fallback to direct delete query if RPC is not available', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function public.delete_session' },
    });
    const fromMock = supabase.from as any;
    const deleteChain = fromMock();
    deleteChain.delete().eq.mockResolvedValueOnce({ error: null });

    const res = await deleteSession('sess-456');
    expect(supabase.from).toHaveBeenCalledWith('sessions');
    expect(res).toEqual({ success: true, deleted_session_id: 'sess-456' });
  });

  it('should throw error if RPC returns permission denied or validation error', async () => {
    const { supabase } = await import('../src/api/supabase.js');
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: false, error: 'PERMISSION_DENIED', message: 'У вас нет прав на удаление этой сессии' },
      error: null,
    });

    await expect(deleteSession('sess-denied')).rejects.toThrow('У вас нет прав на удаление этой сессии');
  });
});
