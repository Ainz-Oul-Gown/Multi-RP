// Скрипт для ручного деплоя (запускать локально с токеном в env)
// SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/run-migrations.mjs

import { readFileSync } from 'fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN env var'); process.exit(1); }

const projectId = 'xhzpxiiqrtmeduynqmsd';

async function runSQL(sql, label) {
  console.log(`\n=== ${label} (${sql.length} chars) ===`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) { console.error(`FAILED: ${data.slice(0, 500)}`); return false; }
  console.log(`OK`);
  return true;
}

const sql1 = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf-8');
const ok1 = await runSQL(sql1, 'Migration 001');
if (!ok1) process.exit(1);

const sql2 = readFileSync('supabase/migrations/002_user_settings.sql', 'utf-8');
const ok2 = await runSQL(sql2, 'Migration 002');
if (!ok2) process.exit(1);

console.log('\n✅ All migrations executed!');
