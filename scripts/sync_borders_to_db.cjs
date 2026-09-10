const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function syncBorders() {
  console.log('📖 Загружаем сгенерированные границы из scripts/generated_borders.json...');
  const borders = JSON.parse(fs.readFileSync('scripts/generated_borders.json', 'utf8'));

  // Получаем мир Этерия 2.6
  const { data: worlds, error: wErr } = await supabase
    .from('worlds')
    .select('id, name')
    .in('name', ['Этерия 2.6', 'Этерия 2.5', 'Этерия 2.0', 'Этерия']);

  if (wErr) {
    console.error('Ошибка получения миров:', wErr);
    process.exit(1);
  }

  console.log(`🌍 Найдено миров для обновления: ${worlds.length}`);

  for (const world of worlds) {
    console.log(`\nОбновляем мир: ${world.name} (${world.id})`);

    const { data: states, error: sErr } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);

    if (sErr) {
      console.error(`Ошибка получения состояний для мира ${world.name}:`, sErr);
      continue;
    }

    for (const state of states) {
      const stateName = state.name;
      const points = borders[stateName];
      if (points && points.length >= 30) {
        const { error: updErr } = await supabase
          .from('states')
          .update({
            border_shape: 'polygon',
            border_data: { points: points }
          })
          .eq('id', state.id);

        if (updErr) {
          console.error(`❌ Ошибка обновления ${stateName}:`, updErr.message);
        } else {
          console.log(`  ✅ ${stateName}: обновлен (${points.length} вершин)`);
        }
      } else {
        console.warn(`  ⚠️ Нет границы для ${stateName}`);
      }
    }
  }

  console.log('\n🎉 Все границы в БД успешно синхронизированы!');
}

syncBorders().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
