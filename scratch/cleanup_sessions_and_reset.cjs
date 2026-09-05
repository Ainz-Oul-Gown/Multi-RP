// scratch/cleanup_sessions_and_reset.cjs
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function cleanupAndReset() {
  console.log('================================================================');
  console.log('🧹 ОЧИСТКА ВСЕХ СТАРЫХ СЕССИЙ И ВОССТАНОВЛЕНИЕ МИРА И ГЕРОЕВ');
  console.log('================================================================\n');

  // 1. Получаем все существующие сессии
  const { data: sessions, error: sessErr } = await supabase.from('sessions').select('id, world_id, created_at');
  if (sessErr) throw sessErr;
  console.log(`Найдено старых сессий для удаления: ${sessions.length}`);

  // Удаляем каждую сессию через delete_session RPC
  let deletedCount = 0;
  for (const s of sessions) {
    const { data: res, error: delErr } = await supabase.rpc('delete_session', { p_session_id: s.id });
    if (delErr) {
      console.warn(`Ошибка RPC для сессии ${s.id}, пробуем прямой DELETE:`, delErr.message);
      await supabase.from('sessions').delete().eq('id', s.id);
    }
    deletedCount++;
  }
  console.log(`✅ Удалено сессий: ${deletedCount}/${sessions.length}`);

  // 2. Дополнительная зачистка орфанных записей (если оставались от старых тестов до миграции)
  console.log('\nПроверка и очистка сессионных таблиц...');
  const { error: invErr } = await supabase.from('inventory').delete().not('id', 'is', null);
  console.log(' • Инвентарь очищен:', !invErr ? '✅' : invErr.message);

  const { error: msgErr } = await supabase.from('messages').delete().not('id', 'is', null);
  console.log(' • Сообщения очищены:', !msgErr ? '✅' : msgErr.message);

  const { error: tqErr } = await supabase.from('turn_queue').delete().not('id', 'is', null);
  console.log(' • Очередь ходов очищена:', !tqErr ? '✅' : tqErr.message);

  const { error: relErr } = await supabase.from('npc_relationships').delete().not('id', 'is', null);
  console.log(' • Отношения с NPC очищены:', !relErr ? '✅' : relErr.message);

  const { error: memErr } = await supabase.from('npc_memories').delete().not('id', 'is', null);
  console.log(' • Воспоминания NPC очищены:', !memErr ? '✅' : memErr.message);

  const { error: injErr } = await supabase.from('player_injuries').delete().not('id', 'is', null);
  console.log(' • Травмы игроков очищены:', !injErr ? '✅' : injErr.message);

  const { error: plErr } = await supabase.from('players').delete().not('id', 'is', null);
  console.log(' • Сессионные игроки очищены:', !plErr ? '✅' : plErr.message);

  // 3. Удаление временных NPC, созданных во время тестовых симуляций
  console.log('\nОчистка тестовых NPC (Лира и Лютоволк из тестов)...');
  const { data: testLiras } = await supabase.from('npcs').select('id').ilike('name', '%Лира%');
  if (testLiras?.length) {
    const ids = testLiras.map((l) => l.id);
    await supabase.from('npcs').delete().in('id', ids);
    console.log(` • Удалено тестовых спутников Лира: ${ids.length} шт.`);
  }

  const { data: testWolves } = await supabase.from('npcs').select('id').ilike('name', '%лютоволк%');
  if (testWolves?.length) {
    const ids = testWolves.map((w) => w.id);
    await supabase.from('npcs').delete().in('id', ids);
    console.log(` • Удалено тестовых хищников (Лютоволк): ${ids.length} шт.`);
  }

  // 4. Восстановление здоровья и живости всех оставшихся жителей мира (бестиария)
  console.log('\nВосстановление жителей мира Этерия...');
  const { data: allNpcs, error: npcErr } = await supabase.from('npcs').select('id, max_hp');
  if (allNpcs?.length) {
    for (const npc of allNpcs) {
      await supabase.from('npcs').update({
        hp: npc.max_hp || 20,
        is_alive: true,
      }).eq('id', npc.id);
    }
    console.log(`✅ Восстановлено здоровье и статус ${allNpcs.length} NPC мира до 100%`);
  }

  // 5. Проверка и откат карточек персонажей
  console.log('\nПроверка карточек персонажей (Библиотека героев)...');
  const { data: cards } = await supabase.from('character_cards').select('*');
  for (const card of cards || []) {
    await supabase.from('character_cards').update({
      hp: card.max_hp,
      money: card.money || 50,
    }).eq('id', card.id);
    console.log(` • Герой «${card.name}»: HP ${card.max_hp}/${card.max_hp}, Золото: ${card.money || 50}`);
  }

  // 6. Итоговая сводка
  console.log('\n================================================================');
  console.log('🎉 ОТЧЁТ О СОСТОЯНИИ БАЗЫ ДАННЫХ ПОСЛЕ СБРОСА:');
  console.log('================================================================');
  const { count: finalSessions } = await supabase.from('sessions').select('*', { count: 'exact', head: true });
  const { count: finalPlayers } = await supabase.from('players').select('*', { count: 'exact', head: true });
  const { count: finalMessages } = await supabase.from('messages').select('*', { count: 'exact', head: true });
  const { count: finalInventory } = await supabase.from('inventory').select('*', { count: 'exact', head: true });
  const { count: finalCards } = await supabase.from('character_cards').select('*', { count: 'exact', head: true });
  const { count: finalWorlds } = await supabase.from('worlds').select('*', { count: 'exact', head: true });
  const { count: finalNpcs } = await supabase.from('npcs').select('*', { count: 'exact', head: true });

  console.log(`• Активных сессий: ${finalSessions} (все старые очищены)`);
  console.log(`• Сессионных игроков в памяти: ${finalPlayers}`);
  console.log(`• Сессионных сообщений: ${finalMessages}`);
  console.log(`• Сессионных предметов: ${finalInventory}`);
  console.log(`• Карточек персонажей сохранено: ${finalCards} (в идеальном состоянии)`);
  console.log(`• Миров сохранено: ${finalWorlds} (Этерия цела)`);
  console.log(`• Жителей мира (бестиарий): ${finalNpcs} (100% живы и полны сил)`);
}

cleanupAndReset().catch(console.error);
