import { readFileSync } from 'fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN env var'); process.exit(1); }

const projectId = 'xhzpxiiqrtmeduynqmsd';

async function deployFunction(slug, filePath) {
  console.log(`\n=== Deploying: ${slug} ===`);
  const code = readFileSync(filePath, 'utf-8');
  let res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name: slug, body: code, verify_jwt: true }),
  });
  let data = await res.text();
  console.log(`Create: ${res.status}`);
  if (res.status === 409 || data.includes('already exists')) {
    const list = await (await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
    const fn = list.find(f => f.slug === slug);
    if (fn) {
      res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions/${fn.id}`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: code, verify_jwt: true }),
      });
      data = await res.text();
      console.log(`Update: ${res.status}`);
    }
  }
  if (!res.ok) { console.error(`FAILED: ${data.slice(0, 300)}`); return false; }
  console.log(`OK: ${slug}`);
  return true;
}

const ok1 = await deployFunction('process-turn', 'supabase/functions/process-turn/index.ts');
const ok2 = await deployFunction('generate-character', 'supabase/functions/generate-character/index.ts');
const ok3 = await deployFunction('convert-world-text', 'supabase/functions/convert-world-text/index.ts');
if (!ok1 || !ok2 || !ok3) process.exit(1);
console.log('\n✅ All Edge Functions deployed!');
