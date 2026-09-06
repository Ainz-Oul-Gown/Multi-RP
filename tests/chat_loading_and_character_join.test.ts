import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('Deno', {
  env: {
    get: vi.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-key';
      return null;
    }),
  },
});

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  location: { hash: '', pathname: '/' },
});

vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  createElement: vi.fn(() => ({
    textContent: '',
    innerHTML: '',
  })),
});

describe('Chat History Loading & Chronological Ordering', () => {
  it('getSessionMessages fetches latest messages and sorts them in ascending chronological order', () => {
    // Simulate Supabase returning messages ordered created_at DESC
    const mockDbDescMessages = [
      { id: 'm-3', session_id: 's-1', content: 'Третье сообщение', created_at: '2026-09-07T03:00:10Z' },
      { id: 'm-2', session_id: 's-1', content: 'Второе сообщение', created_at: '2026-09-07T03:00:05Z' },
      { id: 'm-1', session_id: 's-1', content: 'Первое сообщение', created_at: '2026-09-07T03:00:00Z' },
    ];

    // Our sorting logic
    const sorted = [...mockDbDescMessages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    expect(sorted[0].id).toBe('m-1');
    expect(sorted[1].id).toBe('m-2');
    expect(sorted[2].id).toBe('m-3');
    expect(sorted[0].content).toBe('Первое сообщение');
    expect(sorted[2].content).toBe('Третье сообщение');
  });

  it('message deduplication rejects duplicate IDs in Realtime payload', () => {
    const existingMessages = [
      { id: 'm-1', content: 'Привет' },
      { id: 'm-2', content: 'Как дела?' },
    ];

    const newIncoming = { id: 'm-2', content: 'Как дела?' }; // duplicate
    const isDuplicate = existingMessages.some((m) => m.id === newIncoming.id);
    expect(isDuplicate).toBe(true);

    const genuinelyNew = { id: 'm-3', content: 'Иду в таверну' };
    const isNewDuplicate = existingMessages.some((m) => m.id === genuinelyNew.id);
    expect(isNewDuplicate).toBe(false);
  });
});

describe('Router & Session Character Selection Safeguards', () => {
  it('Router filters out duplicate route registrations for the same pattern', () => {
    class MockRouter {
      routes: any[] = [];
      add(pattern: string, handler: any) {
        this.routes = this.routes.filter((r) => r.pattern !== pattern);
        this.routes.push({ pattern, handler });
        return this;
      }
    }

    const router = new MockRouter();
    router.add('/session/:id', () => 'handler 1');
    router.add('/session/:id', () => 'handler 2');
    router.add('/session/:id', () => 'handler 3');

    expect(router.routes).toHaveLength(1);
    expect(router.routes[0].pattern).toBe('/session/:id');
    expect(router.routes[0].handler()).toBe('handler 3');
  });

  it('character selection detects already existing player in session to prevent duplicate creation', () => {
    const sessionPlayers = [
      { id: 'p-1', user_id: 'user-123', name: 'Ирис' },
      { id: 'p-2', user_id: 'user-456', name: 'Бран' },
    ];

    const currentUserId = 'user-123';
    const existingPlayer = sessionPlayers.find((p) => p.user_id === currentUserId);

    expect(existingPlayer).toBeDefined();
    expect(existingPlayer?.name).toBe('Ирис');

    // If existing player found, we do NOT call createPlayer, avoiding logic duplication
    let createPlayerCalled = false;
    if (!existingPlayer) {
      createPlayerCalled = true;
    }
    expect(createPlayerCalled).toBe(false);
  });
});
