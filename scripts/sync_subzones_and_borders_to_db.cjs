const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function runBatch(items, fn, batchSize = 25) {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    await Promise.all(chunk.map(fn));
  }
}

async function syncAll() {
  const worldData = JSON.parse(fs.readFileSync('Этерия 2.6.json', 'utf8'));
  const borders = JSON.parse(fs.readFileSync('scripts/generated_borders.json', 'utf8'));

  // Get all Этерия worlds
  const { data: worlds, error: wErr } = await supabase
    .from('worlds')
    .select('id, name')
    .in('name', ['Этерия 2.6', 'Этерия 2.5', 'Этерия 2.0', 'Этерия']);

  if (wErr) { console.error(wErr); process.exit(1); }
  console.log('Worlds found: ' + worlds.map(w => w.name).join(', '));

  for (const world of worlds) {
    console.log('\n========================================');
    console.log('Syncing world: ' + world.name + ' (' + world.id + ')');
    console.log('========================================');

    // 1. Sync state borders and colors
    const { data: states, error: sErr } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);

    if (sErr) { console.error(sErr); continue; }

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
      if (error) console.error('  ❌ State ' + state.name + ': ' + error.message);
      else console.log('  ✅ State ' + state.name + ': border synced (' + pts.length + ' pts, color ' + b.color + ')');
    }

    // 2. Sync subzones
    const stateIds = states.map(s => s.id);
    const stateMap = {};
    for (const st of states) stateMap[st.name] = st.id;

    const { data: dbLocs } = await supabase
      .from('locations')
      .select('id, name, state_id')
      .in('state_id', stateIds);

    const dbLocMap = {};
    for (const l of (dbLocs || [])) {
      if (!dbLocMap[l.state_id]) dbLocMap[l.state_id] = {};
      dbLocMap[l.state_id][l.name] = l.id;
    }

    const locIds = (dbLocs || []).map(l => l.id);
    const { data: dbSubzones } = await supabase
      .from('subzones')
      .select('id, name, location_id')
      .in('location_id', locIds);

    const dbSubzoneMap = {};
    for (const sz of (dbSubzones || [])) {
      if (!dbSubzoneMap[sz.location_id]) dbSubzoneMap[sz.location_id] = {};
      dbSubzoneMap[sz.location_id][sz.name] = sz.id;
    }

    // Prepare list of subzone updates
    const updates = [];
    for (const jsonState of (worldData.geography?.states || [])) {
      const stateId = stateMap[jsonState.name];
      if (!stateId) continue;

      for (const jsonLoc of (jsonState.locations || [])) {
        const locId = dbLocMap[stateId]?.[jsonLoc.name];
        if (!locId) continue;

        for (const jsonSz of (jsonLoc.subzones || [])) {
          const szId = dbSubzoneMap[locId]?.[jsonSz.name];
          if (!szId) continue;

          updates.push({
            id: szId,
            pos_x: jsonSz.pos_x,
            pos_y: jsonSz.pos_y,
            radius: jsonSz.radius || 0.35
          });
        }
      }
    }

    console.log('  Updating ' + updates.length + ' subzones in DB...');
    let updatedCount = 0;
    await runBatch(updates, async (u) => {
      const { error } = await supabase.from('subzones').update({
        pos_x: u.pos_x,
        pos_y: u.pos_y,
        radius: u.radius
      }).eq('id', u.id);
      if (!error) updatedCount++;
    }, 30);

    console.log('  ✅ Successfully synced ' + updatedCount + ' / ' + updates.length + ' subzones for ' + world.name);
  }

  console.log('\n🎉 ALL WORLDS, BORDERS & SUBZONES SYNCED TO DB!');
}

syncAll().catch(err => { console.error(err); process.exit(1); });
