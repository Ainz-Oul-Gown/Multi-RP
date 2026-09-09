// scripts/sync_etheria_db.cjs
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function syncEtheria() {
  console.log('📖 Загружаем файл Этерия.json...');
  const etheriaRaw = fs.readFileSync('Этерия.json', 'utf8');
  const etheria = JSON.parse(etheriaRaw);

  const { data: worlds, error: wErr } = await supabase
    .from('worlds')
    .select('id, name, owner_id')
    .in('name', ['Этерия', 'Этерия 2.0']);

  if (wErr) {
    console.error('Ошибка получения миров:', wErr);
    return;
  }

  console.log(`🌍 Найдено миров для синхронизации: ${worlds.length}`);

  for (const world of worlds) {
    console.log(`\n========================================`);
    console.log(`Синхронизация мира: ${world.name} (${world.id})`);
    console.log(`========================================`);

    // 1. Обновляем настройки мира
    const { error: updWErr } = await supabase
      .from('worlds')
      .update({
        settings: etheria.world.settings || {},
        description: etheria.world.description || '',
      })
      .eq('id', world.id);
    if (updWErr) console.warn('Ошибка обновления настроек мира:', updWErr.message);
    else console.log('✅ Настройки мира обновлены (scale_unit: километры)');

    // 2. Обновляем локации и регионы
    const { data: dbStates } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);

    const stateMap = new Map();
    (dbStates || []).forEach(s => stateMap.set(s.name.toLowerCase().trim(), s.id));

    let updatedLocCount = 0;
    let createdLocCount = 0;
    let updatedSubzoneCount = 0;
    const locIdMapByName = new Map();

    for (const jsonState of etheria.geography?.states || []) {
      let stateId = stateMap.get(jsonState.name.toLowerCase().trim());
      if (!stateId) {
        const { data: createdState } = await supabase
          .from('states')
          .insert({
            world_id: world.id,
            name: jsonState.name,
            description: jsonState.description || '',
          })
          .select()
          .single();
        if (createdState) {
          stateId = createdState.id;
          stateMap.set(jsonState.name.toLowerCase().trim(), stateId);
        }
      }

      if (!stateId) continue;

      // Получаем существующие локации в этом штате
      const { data: dbLocations } = await supabase
        .from('locations')
        .select('id, name')
        .eq('state_id', stateId);

      const locDbMap = new Map();
      (dbLocations || []).forEach(l => locDbMap.set(l.name.toLowerCase().trim(), l.id));

      for (const jsonLoc of jsonState.locations || []) {
        const locPayload = {
          name: jsonLoc.name,
          type: jsonLoc.type || 'city',
          terrain_type: jsonLoc.terrain_type || 'open',
          description: jsonLoc.description || '',
          pos_x: Number(jsonLoc.pos_x) || 0,
          pos_y: Number(jsonLoc.pos_y) || 0,
          bounds_shape: ['circle', 'rect', 'polygon'].includes(jsonLoc.bounds_shape) ? jsonLoc.bounds_shape : 'circle',
          bounds_data: jsonLoc.bounds_data || { radius: 100 },
          danger_level: ['safe', 'normal', 'danger', 'lethal'].includes(jsonLoc.danger_level) ? jsonLoc.danger_level : 'normal',
          zones: Array.isArray(jsonLoc.zones) ? jsonLoc.zones : [],
          location_map: jsonLoc.location_map || {},
        };

        let locId = locDbMap.get(jsonLoc.name.toLowerCase().trim());
        if (locId) {
          await supabase.from('locations').update(locPayload).eq('id', locId);
          updatedLocCount++;
        } else {
          const { data: createdLoc } = await supabase
            .from('locations')
            .insert({ ...locPayload, state_id: stateId })
            .select()
            .single();
          if (createdLoc) {
            locId = createdLoc.id;
            createdLocCount++;
          }
        }

        if (locId) {
          locIdMapByName.set(jsonLoc.name.toLowerCase().trim(), locId);

          // Обновляем сабзоны
          if (Array.isArray(jsonLoc.subzones) && jsonLoc.subzones.length > 0) {
            const { data: existingSubzones } = await supabase
              .from('subzones')
              .select('id, name')
              .eq('location_id', locId);

            const existingSubMap = new Map();
            (existingSubzones || []).forEach(sz => existingSubMap.set(sz.name.toLowerCase().trim(), sz.id));

            for (const sz of jsonLoc.subzones) {
              const szPayload = {
                name: sz.name,
                description: sz.description || '',
                pos_x: Number(sz.pos_x) || 0,
                pos_y: Number(sz.pos_y) || 0,
                radius: Number(sz.radius) || 10,
              };

              const existingId = existingSubMap.get(sz.name.toLowerCase().trim());
              if (existingId) {
                await supabase.from('subzones').update(szPayload).eq('id', existingId);
                updatedSubzoneCount++;
              } else {
                await supabase.from('subzones').insert({ ...szPayload, location_id: locId });
                updatedSubzoneCount++;
              }
            }
          }
        }
      }
    }

    console.log(`🗺️ Локации: обновлено ${updatedLocCount}, создано ${createdLocCount}`);
    console.log(`📍 Сабзоны: синхронизировано ${updatedSubzoneCount}`);

    // 3. Синхронизируем NPC (координаты, роли, параметры)
    const { data: dbNpcs } = await supabase
      .from('npcs')
      .select('id, name')
      .eq('world_id', world.id);

    const npcDbMap = new Map();
    (dbNpcs || []).forEach(n => npcDbMap.set(n.name.toLowerCase().trim(), n.id));

    let updatedNpcCount = 0;
    let createdNpcCount = 0;

    for (const jsonNpc of etheria.bestiary?.npcs || []) {
      const targetLocId = jsonNpc.location_name
        ? locIdMapByName.get(jsonNpc.location_name.toLowerCase().trim())
        : null;

      const npcPayload = {
        name: jsonNpc.name,
        race: jsonNpc.race || 'Человек',
        class: jsonNpc.class || '',
        category: jsonNpc.category || 'humanoid',
        role: jsonNpc.role || 'secondary',
        appearance: jsonNpc.appearance || '',
        background: jsonNpc.background || '',
        stats: jsonNpc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        temperament: jsonNpc.temperament || '',
        motivation: jsonNpc.motivation || '',
        current_mood: jsonNpc.current_mood || 'calm',
        speech_style: typeof jsonNpc.speech_style === 'string' ? jsonNpc.speech_style : '',
        secrets: typeof jsonNpc.secrets === 'string' ? jsonNpc.secrets : '',
        rumors: Array.isArray(jsonNpc.rumors) ? jsonNpc.rumors : [],
        daily_routine: typeof jsonNpc.daily_routine === 'string' ? jsonNpc.daily_routine : '',
        current_activity: jsonNpc.current_activity || '',
        level: jsonNpc.level || 1,
        tier: jsonNpc.tier || 1,
        hit_dice: jsonNpc.hit_dice || 8,
        level_min: jsonNpc.level_min || jsonNpc.level || 1,
        level_max: jsonNpc.level_max || jsonNpc.level || 1,
        pos_x: Number(jsonNpc.pos_x) || 0,
        pos_y: Number(jsonNpc.pos_y) || 0,
        special_attacks: Array.isArray(jsonNpc.special_attacks) ? jsonNpc.special_attacks : [],
        base_attacks: Array.isArray(jsonNpc.base_attacks) ? jsonNpc.base_attacks : [],
        is_pack_instance: Boolean(jsonNpc.is_pack),
        pack_size: jsonNpc.pack_size || 1,
        is_unique: Boolean(jsonNpc.is_unique),
      };

      if (targetLocId) {
        npcPayload.location_id = targetLocId;
      }

      const existingNpcId = npcDbMap.get(jsonNpc.name.toLowerCase().trim());
      if (existingNpcId) {
        await supabase.from('npcs').update(npcPayload).eq('id', existingNpcId);
        updatedNpcCount++;
      } else {
        await supabase.from('npcs').insert({ ...npcPayload, world_id: world.id });
        createdNpcCount++;
      }
    }

    console.log(`👥 NPC: обновлено ${updatedNpcCount}, создано ${createdNpcCount}`);

    // 4. Обновляем scale_unit во всех связанных сессиях
    const { data: updatedSessions, error: sessUpdErr } = await supabase
      .from('sessions')
      .update({ scale_unit: 'километры' })
      .eq('world_id', world.id)
      .select('id');

    if (!sessUpdErr && updatedSessions?.length) {
      console.log(`⏱️ Обновлены сессии (${updatedSessions.length}) -> scale_unit: 'километры'`);
    }
  }

  console.log('\n🎉 ВСЯ БАЗА ДАННЫХ УСПЕШНО СИНХРОНИЗИРОВАНА С ЭТЕРИЯ.JSON!');
}

syncEtheria().catch(console.error);
