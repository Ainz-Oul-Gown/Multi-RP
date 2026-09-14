const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    env[k] = v;
  }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = env.E2E_SUPABASE_SERVICE_KEY;
const SESSION_ID = '6a72db7e-a082-4889-9dc0-a195658ac71c';
const PLAYER_ID = 'b0763030-44da-45cb-8bcb-61c06b3c97f4';

if (!SERVICE_KEY) {
  console.error('E2E_SUPABASE_SERVICE_KEY not set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function cleanup() {
  const { data: msgs, error: msgsErr } = await supabase
    .from('messages')
    .select('id, created_at')
    .eq('session_id', SESSION_ID)
    .order('created_at', { ascending: true });

  if (msgsErr) {
    console.error('Error fetching messages:', msgsErr.message);
    return;
  }
  console.log('Messages before cleanup:', msgs.length);
  if (msgs.length > 2) {
    const toDelete = msgs.slice(2).map(m => m.id);
    const { error } = await supabase.from('messages').delete().in('id', toDelete);
    if (error) console.error('Delete error:', error.message);
    else console.log('Deleted:', toDelete.length, 'messages');
  } else {
    console.log('Nothing to clean');
  }

  const { data: rels } = await supabase
    .from('npc_relationships')
    .select('id, npc_id, relationship_score')
    .eq('player_id', PLAYER_ID);

  console.log('NPC relationships found:', rels ? rels.length : 0);
  console.log('Done. Ready for test 03.');
}

cleanup().catch(console.error);
