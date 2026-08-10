import { readFileSync } from 'fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN env var'); process.exit(1); }

const projectId = 'xhzpxiiqrtmeduynqmsd';

async function deployFunction(slug, filePath) {
  console.log(`\n=== Deploying: ${slug} ===`);
  const code = readFileSync(filePath, 'utf-8');

  // Get existing
  const listRes = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const list = await listRes.json();
  const existing = list.find(f => f.slug === slug);

  if (existing) {
    console.log(`Deleting existing ${slug}...`);
    await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions/${existing.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    // Wait for deletion to propagate
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`Creating ${slug}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name: slug, body: code, verify_jwt: true }),
  });
  const data = await res.text();
  console.log(`Create: ${res.status}`);

  if (!res.ok) { console.error(`FAILED: ${data.slice(0, 500)}`); return false; }
  console.log(`OK: ${slug}`);
  return true;
}

const ok1 = await deployFunction('process-turn', 'supabase/functions/process-turn/index.ts');
const ok2 = await deployFunction('generate-character', 'supabase/functions/generate-character/index.ts');
const ok3 = await deployFunction('convert-world-text', 'supabase/functions/convert-world-text/index.ts');
if (!ok1 || !ok2 || !ok3) process.exit(1);
console.log('\n✅ All Edge Functions deployed!');
