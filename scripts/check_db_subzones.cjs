const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkSubzones() {
  const { data: worlds } = await supabase.from('worlds').select('id, name').in('name', ['Этерия 2.6', 'Этерия 2.5', 'Этерия 2.0', 'Этерия']);
  console.log('Worlds:', worlds.map(w => w.name));

  for (const w of worlds) {
    const { data: states } = await supabase.from('states').select('id, name').eq('world_id', w.id);
    const stateIds = states.map(s => s.id);
    const { data: locs } = await supabase.from('locations').select('id, name').in('state_id', stateIds);
    const locIds = locs.map(l => l.id);
    const { count } = await supabase.from('subzones').select('id', { count: 'exact', head: true }).in('location_id', locIds);
    console.log('World ' + w.name + ': ' + states.length + ' states, ' + locs.length + ' locations, ' + count + ' subzones in DB');
  }
}
checkSubzones();
