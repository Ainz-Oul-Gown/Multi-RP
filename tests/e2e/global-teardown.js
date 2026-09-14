// tests/e2e/global-teardown.js
// Очищает тестовые данные после всех тестов
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;


export default async function globalTeardown() {
  // Teardown опциональный — не удаляем данные чтобы можно было изучить результаты
  // Раскомментируй если нужна полная очистка:
  /*
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = listData?.users?.find(u => u.email === 'e2e_playwright_test@multirp.test');
  if (user) {
    await supabase.auth.admin.deleteUser(user.id);
    console.log('🧹 Test user deleted');
  }
  */
  console.log('\n🏁 [Global Teardown] E2E tests completed. Test data retained for inspection.');
  console.log('   Reports: tests/e2e/reports/html/index.html');
}
