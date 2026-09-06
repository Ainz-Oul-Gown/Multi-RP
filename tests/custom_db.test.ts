// tests/custom_db.test.ts
// Тесты для пользовательской БД Supabase (Bring Your Own Database)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getActiveDatabaseConfig,
  setDatabaseConfig,
  generateDbInviteUrl,
  testDatabaseConnection,
} from '../src/api/supabase.js';
import { saveCustomDbConfig, loadCustomDbConfig, clearCustomDbConfig } from '../src/utils/indexedDB.js';

describe('Custom Supabase Database (BYOD)', () => {
  beforeEach(async () => {
    await clearCustomDbConfig();
    await setDatabaseConfig({ isCustom: false });
  });

  describe('setDatabaseConfig & getActiveDatabaseConfig', () => {
    it('should start with default database config', () => {
      const config = getActiveDatabaseConfig();
      expect(config.isCustom).toBe(false);
      expect(config.url).toBe(config.defaultUrl);
      expect(config.anonKey).toBe(config.defaultKey);
    });

    it('should switch to custom database and reflect in getActiveDatabaseConfig', async () => {
      const customUrl = 'https://custom-project.supabase.co';
      const customKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.customkey';

      await setDatabaseConfig({
        isCustom: true,
        url: customUrl,
        anonKey: customKey,
      });

      const config = getActiveDatabaseConfig();
      expect(config.isCustom).toBe(true);
      expect(config.url).toBe(customUrl);
      expect(config.anonKey).toBe(customKey);
    });

    it('should revert to default database when isCustom is false', async () => {
      await setDatabaseConfig({
        isCustom: true,
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
      });
      expect(getActiveDatabaseConfig().isCustom).toBe(true);

      await setDatabaseConfig({ isCustom: false });
      const config = getActiveDatabaseConfig();
      expect(config.isCustom).toBe(false);
      expect(config.url).toBe(config.defaultUrl);
    });
  });

  describe('generateDbInviteUrl', () => {
    it('should generate invite URL with encoded custom_db token', () => {
      const url = 'https://friend-db.supabase.co';
      const key = 'friend-anon-key-123';
      const inviteLink = generateDbInviteUrl(url, key);

      expect(inviteLink).toContain('#/auth?custom_db=');
      const token = inviteLink.split('custom_db=')[1];
      const decoded = JSON.parse(atob(decodeURIComponent(token)));
      expect(decoded.u).toBe(url);
      expect(decoded.k).toBe(key);
    });
  });

  describe('testDatabaseConnection validation', () => {
    it('should return error if URL or Key is empty', async () => {
      const res1 = await testDatabaseConnection('', 'key');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('обязательны');

      const res2 = await testDatabaseConnection('https://abc.supabase.co', '');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('обязательны');
    });

    it('should return error if URL does not start with https:// or http://', async () => {
      const res = await testDatabaseConnection('invalid-url.com', 'key');
      expect(res.success).toBe(false);
      expect(res.error).toContain('должен начинаться');
    });

    it('should call onProgress and return emptySchema: true when worlds table is missing from schema cache', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'PGRST205',
              details: null,
              hint: null,
              message: "could not find the table 'public.worlds' in the schema cache",
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );

      const progressSteps: string[] = [];
      const res = await testDatabaseConnection('https://mock-custom.supabase.co', 'mock-anon-key', {
        retries: 2,
        retryDelayMs: 10,
        onProgress: (msg: string) => progressSteps.push(msg),
      });

      expect(res.success).toBe(true);
      expect(res.emptySchema).toBe(true);
      expect(progressSteps.length).toBeGreaterThanOrEqual(2);
      expect(progressSteps[0]).toContain('Проверка подключения');

      fetchSpy.mockRestore();
    });

    it('should return emptySchema: false when worlds table exists and responds', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([{ id: 'world-1' }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );

      const res = await testDatabaseConnection('https://mock-custom.supabase.co', 'mock-anon-key', {
        retries: 1,
      });

      expect(res.success).toBe(true);
      expect(res.emptySchema).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  describe('IndexedDB config storage', () => {
    it('should save and load custom DB config', async () => {
      const saved = await saveCustomDbConfig({
        isCustom: true,
        url: 'https://indexed-db-test.supabase.co',
        anonKey: 'anon-test-key-xyz',
      });
      expect(saved?.url).toBe('https://indexed-db-test.supabase.co');

      const loaded = await loadCustomDbConfig();
      expect(loaded?.isCustom).toBe(true);
      expect(loaded?.url).toBe('https://indexed-db-test.supabase.co');
      expect(loaded?.anonKey).toBe('anon-test-key-xyz');
    });

    it('should clear custom DB config', async () => {
      await saveCustomDbConfig({
        isCustom: true,
        url: 'https://to-delete.supabase.co',
        anonKey: 'del-key',
      });
      await clearCustomDbConfig();
      const loaded = await loadCustomDbConfig();
      expect(loaded).toBeNull();
    });
  });
});
