const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function syncAll() {
  const worldData = JSON.parse(fs.readFileSync('Этерия 2.6.json', 'utf8'));
  const borders = JSON.parse(fs.readFileSync('scripts/generated_borders.json', 'utf8'));

  // Get all Этерия worlds
  const { data: worlds, error: wErr } = await supabase
    .from('worlds')
    .select('id, name')
    .in('name', ['Этерия 2.6', 'Этерия 2.5', 'Этерия 2.0', 'Этерия']);

  if (wErr) { console.error(wErr); process.exit(1); }
  console.log(`Worlds: ${worlds.map(w => w.name).join(', ')}`);

  for (const world of worlds) {
    console.log(`\n=== ${world.name} ===`);

    // 1. Sync borders/colors
    const { data: states } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);

    for (const state of states) {
      const b = borders[state.name];
      if (!b) continue;
      const pts = b.points || [];
      const polys = b.polygons || (pts.length ? [pts] : []);
      const { error } = await supabase.from('states').update({
        border_shape: 'polygon',
        border_data: { points: pts, polygons: polys },
        map_color: b.color || null
      }).eq('id', state.id);
      if (error) console.error(`  ❌ ${state.name}: ${error.message}`);
      else console.log(`  ✅ ${state.name}: border/color synced (${pts.length} pts, color: ${b.color})`);
    }

    // 2. Sync locations
    // Get all state IDs for this world
    const stateMap = {};
    for (const st of states) stateMap[st.name] = st.id;

    // Get all locations for this world (via state_id)
    const stateIds = states.map(s => s.id);
    const { data: dbLocs } = await supabase
      .from('locations')
      .select('id, name, state_id, pos_x, pos_y')
      .in('state_id', stateIds);

    // Build DB location map: state_id -> name -> loc
    const dbLocMap = {};
    for (const l of (dbLocs || [])) {
      if (!dbLocMap[l.state_id]) dbLocMap[l.state_id] = {};
      dbLocMap[l.state_id][l.name] = l;
    }

    // Update from JSON
    const jsonStates = worldData.geography?.states || [];
    let locMoved = 0;
    let locNotFound = 0;

    for (const jsonState of jsonStates) {
      const stateId = stateMap[jsonState.name];
      if (!stateId) continue;
      
      for (const loc of (jsonState.locations || [])) {
        const dbLoc = dbLocMap[stateId]?.[loc.name];
        if (!dbLoc) {
          locNotFound++;
          continue;
        }
        const { error } = await supabase.from('locations').update({
          pos_x: loc.pos_x,
          pos_y: loc.pos_y
        }).eq('id', dbLoc.id);
        if (error) console.error(`  ❌ Location ${loc.name}: ${error.message}`);
        else locMoved++;
      }
    }

    console.log(`  📍 Locations updated: ${locMoved}, not found: ${locNotFound}`);
  }

  console.log('\n🎉 All synced!');
}

syncAll().catch(err => { console.error(err); process.exit(1); });
