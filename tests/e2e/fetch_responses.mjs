// Получить последние AI ответы из БД для оценки
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDU5NzEsImV4cCI6MjEwMTkyMTk3MX0.F9rh-vkpRiRQNXntWUuFQDzZdNIY_0HES6NJCi6zcM0';

// Читаем сохранённую сессию из тестов
const sessionFile = JSON.parse(readFileSync('tests/e2e/.auth/auth-session.json', 'utf8'));
const ACCESS_TOKEN = sessionFile.session?.access_token || sessionFile.access_token;

const sb = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
});

const SESSION_ID = '6a72db7e-a082-4889-9dc0-a195658ac71c';
const { data, error } = await sb
  .from('messages')
  .select('*')
  .eq('session_id', SESSION_ID)
  .order('created_at', { ascending: false })
  .limit(10);

if (error) { console.error('Error:', error.message); process.exit(1); }
if (!data?.length) { console.log('No messages found'); process.exit(0); }

// Определяем колонки автоматически
const keys = Object.keys(data[0]);
console.log('Columns:', keys.join(', '));
console.log('\n=== Последние сообщения (тест 03) ===');
data?.reverse().forEach(m => {
  const role = m.sender_role || m.role || m.type || m.sender || 'unknown';
  const text = m.content || m.text || m.message || m.body || '';
  const emoji = role.includes('assistant') || role.includes('ai') || role.includes('dm') ? '🤖 AI' 
               : role.includes('user') || role.includes('player') ? '👤 Player' : `[${role}]`;
  console.log(`\n${emoji} [${new Date(m.created_at).toLocaleTimeString()}]`);
  console.log(text.slice(0, 600));
});
