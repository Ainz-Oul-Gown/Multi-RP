// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация — session.json записывается в global-setup напрямую
// Этот файл только верифицирует что session.json существует

import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.resolve('tests/e2e/.auth/session.json');

setup('authenticate via UI', async () => {
  console.log('\n🔐 [Auth Setup] Checking session.json...');

  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(
      `session.json not found at ${AUTH_FILE}. ` +
      'global-setup should have created it. Check global-setup logs.'
    );
  }

  // Проверяем что файл содержит валидный токен
  const storageState = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const localStorage = storageState?.origins?.[0]?.localStorage || [];
  const authToken = localStorage.find(item => item.name.includes('auth-token'));

  if (!authToken?.value) {
    throw new Error('session.json exists but has no auth token. Re-run global-setup.');
  }

  const session = JSON.parse(authToken.value);
  const expiresAt = session?.expires_at;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt < now) {
    console.log('  ⚠️ Token expired! Will be refreshed by Supabase client automatically.');
  } else {
    const expiresIn = expiresAt ? Math.round((expiresAt - now) / 60) : '?';
    console.log(`  ✅ Auth token valid (expires in ~${expiresIn} min)`);
  }

  console.log('  ✅ session.json ready — tests can proceed');
});
