// Пары 1-31 (ранние)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDU5NzEsImV4cCI6MjEwMTkyMTk3MX0.F9rh-vkpRiRQNXntWUuFQDzZdNIY_0HES6NJCi6zcM0';

const sessionFile = JSON.parse(readFileSync('tests/e2e/.auth/auth-session.json', 'utf8'));
const ACCESS_TOKEN = sessionFile.session?.access_token || sessionFile.access_token;
const sb = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
});

const { data: sessions } = await sb.from('sessions')
  .select('id, created_at').order('created_at', { ascending: false }).limit(5);

let allMessages = [];
for (const s of (sessions || [])) {
  const { data } = await sb.from('messages')
    .select('id, session_id, sender_type, sender_name, content, created_at')
    .eq('session_id', s.id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (data?.length) allMessages.push(...data);
}
allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
// Берём ВСЕ сообщения, не только последние 100
const pairs = [];
for (let i = 0; i < allMessages.length; i++) {
  const m = allMessages[i];
  if ((m.sender_type || '').toLowerCase() === 'player') {
    const next = allMessages[i + 1];
    if (next && ['master','system','narrator'].includes(next.sender_type)) {
      pairs.push({ request: m, response: next });
      i++;
    }
  }
}

// Выводим первые 31 пары
console.log(`Всего пар: ${pairs.length}. Показываю 1-31:\n`);
pairs.slice(0, 31).forEach((p, idx) => {
  const ts = new Date(p.request.created_at).toLocaleTimeString('ru-RU');
  const req = (p.request.content || '').trim();
  const resp = (p.response.content || '').trim();
  const isFail = resp.includes('провалилось') || resp.includes('не найден') || resp.includes('Действие "');
  const hasNarr = resp.split('\n').some(l => l.length > 80);
  const flag = isFail ? '🔴' : !hasNarr ? '⚠️' : '✅';
  console.log(`${flag} [${idx+1}] ${ts} | REQ: ${req.slice(0,120)}`);
  console.log(`      ANS: ${resp.slice(0,250)}`);
  console.log();
});
