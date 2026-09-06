// tests/account_isolation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorlds, getSessions, deletePlayer } from '../src/api/game.js';

vi.mock('../src/api/supabase.js', () => {
  const fromMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
      rpc: vi.fn(),
    },
    signOut: vi.fn(),
    invokeFunction: vi.fn(),
  };
});

describe('Account Isolation: Worlds & Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorlds', () => {
    it('should query all worlds when ownerId is null', async () => {
      const { supabase } = await import('../src/api/supabase.js');
      const orderMock = vi.fn().mockResolvedValue({
        data: [{ id: 'w1', name: 'World 1' }, { id: 'w2', name: 'World 2' }],
        error: null,
      });
      const selectMock = vi.fn(() => ({ order: orderMock }));
      (supabase.from as any).mockReturnValue({ select: selectMock });

      const worlds = await getWorlds();
      expect(supabase.from).toHaveBeenCalledWith('worlds');
      expect(selectMock).toHaveBeenCalledWith('*');
      expect(worlds).toHaveLength(2);
    });

    it('should filter by owner_id when ownerId is provided', async () => {
      const { supabase } = await import('../src/api/supabase.js');
      const eqMock = vi.fn().mockResolvedValue({
        data: [{ id: 'w1', name: 'My World', owner_id: 'user-1' }],
        error: null,
      });
      const orderMock = vi.fn(() => ({ eq: eqMock }));
      const selectMock = vi.fn(() => ({ order: orderMock }));
      (supabase.from as any).mockReturnValue({ select: selectMock });

      const worlds = await getWorlds('user-1');
      expect(supabase.from).toHaveBeenCalledWith('worlds');
      expect(eqMock).toHaveBeenCalledWith('owner_id', 'user-1');
      expect(worlds).toEqual([{ id: 'w1', name: 'My World', owner_id: 'user-1' }]);
    });
  });

  describe('getSessions', () => {
    it('should return empty array immediately when user has no players and no worlds', async () => {
      const { supabase } = await import('../src/api/supabase.js');
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        if (table === 'worlds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        return {};
      });

      const sessions = await getSessions('user-empty');
      expect(sessions).toEqual([]);
    });

    it('should filter sessions by participant and world owner when userId is provided', async () => {
      const { supabase } = await import('../src/api/supabase.js');

      const mockSessionsData = [
        { id: 'sess-1', world_id: 'world-1', difficulty: 'normal' },
        { id: 'sess-2', world_id: 'world-2', difficulty: 'easy' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: vi.fn((cols: string) => {
              if (cols === 'session_id') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [{ session_id: 'sess-1' }],
                    error: null,
                  }),
                };
              }
              // batch query for players in sessions
              return {
                in: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'p1', session_id: 'sess-1', name: 'Hero', user_id: 'user-1', hp: 30, max_hp: 30, is_active: true },
                  ],
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'worlds') {
          return {
            select: vi.fn((cols: string) => {
              if (cols === 'id') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: 'world-2' }],
                    error: null,
                  }),
                };
              }
              // batch query for worlds details
              return {
                in: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'world-1', name: 'World One', owner_id: 'other-user' },
                    { id: 'world-2', name: 'World Two', owner_id: 'user-1' },
                  ],
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'sessions') {
          const orMock = vi.fn().mockResolvedValue({
            data: mockSessionsData,
            error: null,
          });
          const orderMock = vi.fn(() => ({
            or: orMock,
          }));
          return {
            select: vi.fn(() => ({
              order: orderMock,
            })),
          };
        }
        return {};
      });

      const sessions = await getSessions('user-1');
      expect(sessions).toHaveLength(2);
      expect(sessions[0].worlds).toEqual({ id: 'world-1', name: 'World One', owner_id: 'other-user' });
      expect(sessions[1].worlds).toEqual({ id: 'world-2', name: 'World Two', owner_id: 'user-1' });
    });
  });

  describe('deletePlayer', () => {
    it('should delete player record by id', async () => {
      const { supabase } = await import('../src/api/supabase.js');
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const deleteMock = vi.fn(() => ({ eq: eqMock }));
      (supabase.from as any).mockReturnValue({ delete: deleteMock });

      await deletePlayer('player-999');
      expect(supabase.from).toHaveBeenCalledWith('players');
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', 'player-999');
    });
  });
});
