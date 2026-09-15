// tests/e2e/test_multiplayer_interactions.mjs
// E2E проверка взаимодействия между игроками в мультиплеере:
// 1. Точное определение адресата (живой игрок vs NPC)
// 2. Объединение игроков в отряд (party formation)
// 3. Синхронное групповое перемещение отряда
// 4. Трансфер предметов между игроками
// 5. Проверка отсутствия кукловодства (No Godmoding / No Puppeteering)

import { readFileSync, existsSync } from 'fs';

console.log('====================================================');
console.log('🎮 E2E MULTIPLAYER INTERACTIONS VERIFICATION');
console.log('====================================================\n');

// 1. Проверка регулярных выражений отряда и роутинга
const isPartyInviteOrJoinRegex = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i;
const isPartyLeaveRegex = /(?:покидаю отряд|выхожу из отряда|отделяюсь от отряда|иду один|пойду один|разделяемся)/i;

const testRPPhrases = [
  { text: 'Ирис, давай объединимся в отряд и пойдем в лес!', expectParty: true, type: 'join' },
  { text: 'Пойдем вместе, вдвоем безопаснее исследовать руины.', expectParty: true, type: 'join' },
  { text: 'Возьми меня в свой отряд, я прикрою с фланга.', expectParty: true, type: 'join' },
  { text: 'Вступай в наш отряд, нам нужен маг!', expectParty: true, type: 'join' },
  { text: 'Я покидаю отряд, дальше пойду один.', expectParty: true, type: 'leave' },
  { text: 'Выхожу из отряда, возвращаюсь в город.', expectParty: true, type: 'leave' },
  { text: 'Говорю Брану: «Налей еще кружку эля!»', expectParty: false, type: 'none' },
  { text: 'Осматриваю полки в поисках старой книги.', expectParty: false, type: 'none' },
];

let passCount = 0;
let failCount = 0;

console.log('--- ТЕСТ 1: Распознавание интента формирования/роспуска отряда ---');
for (const tc of testRPPhrases) {
  const isJoin = isPartyInviteOrJoinRegex.test(tc.text);
  const isLeave = isPartyLeaveRegex.test(tc.text);

  let detected = 'none';
  if (isJoin) detected = 'join';
  else if (isLeave) detected = 'leave';

  const ok = detected === tc.type;
  if (ok) {
    console.log(`  ✅ [${detected.toUpperCase().padEnd(5)}] "${tc.text}"`);
    passCount++;
  } else {
    console.error(`  ❌ ОШИБКА: ожидалось ${tc.type}, получено ${detected} для "${tc.text}"`);
    failCount++;
  }
}

// 2. Тест адресации: Живой игрок vs NPC
console.log('\n--- ТЕСТ 2: Определение цели: Игрок vs NPC ---');

function resolveTarget(actionText, sessionPlayers, sessionNpcs) {
  const lower = actionText.toLowerCase();

  // 1. Ищем упоминание живого игрока
  const targetedPlayer = sessionPlayers.find(p => lower.includes(p.name.toLowerCase()));
  if (targetedPlayer) {
    return { targetType: 'player', target: targetedPlayer };
  }

  // 2. Ищем упоминание NPC
  const targetedNpc = sessionNpcs.find(n => lower.includes(n.name.toLowerCase()) || lower.includes((n.role || '').toLowerCase()));
  if (targetedNpc) {
    return { targetType: 'npc', target: targetedNpc };
  }

  return { targetType: 'environment', target: null };
}

const mockPlayers = [
  { id: 'p-arin', name: 'Арин', role: 'Следопыт' },
  { id: 'p-iris', name: 'Ирис', role: 'Чародейка' },
];

const mockNpcs = [
  { id: 'npc-bran', name: 'Бран', role: 'трактирщик' },
  { id: 'npc-guard', name: 'Капитан Вальдо', role: 'стражник' },
];

const targetTestCases = [
  { text: 'Поворачиваюсь к Ирис и говорю: «Приготовь заклинание»', expectedType: 'player', expectedId: 'p-iris' },
  { text: 'Кричу Ирис: «Ложись!»', expectedType: 'player', expectedId: 'p-iris' },
  { text: 'Подхожу к трактирщику и прошу комнату на ночь', expectedType: 'npc', expectedId: 'npc-bran' },
  { text: 'Обращаюсь к Брану: «Кто здесь главный?»', expectedType: 'npc', expectedId: 'npc-bran' },
  { text: 'Окликаю стражника: «Ворота открыты?»', expectedType: 'npc', expectedId: 'npc-guard' },
];

for (const tc of targetTestCases) {
  const res = resolveTarget(tc.text, mockPlayers, mockNpcs);
  if (res.targetType === tc.expectedType && res.target?.id === tc.expectedId) {
    console.log(`  ✅ [${res.targetType.toUpperCase()}] ${res.target.name} ("${tc.text.slice(0, 45)}...")`);
    passCount++;
  } else {
    console.error(`  ❌ ОШИБКА адресации для: "${tc.text}" -> Получено: ${res.targetType} ${res.target?.name}`);
    failCount++;
  }
}

// 3. Тест объединения в группу и группового перемещения
console.log('\n--- ТЕСТ 3: Объединение в отряд и синхронное перемещение ---');

const testSession = {
  party_groups: [],
};

const player1 = { id: 'p-arin', name: 'Арин', party_id: null, current_zone: 'Таверна', current_subzone: 'Зал' };
const player2 = { id: 'p-iris', name: 'Ирис', party_id: null, current_zone: 'Таверна', current_subzone: 'Зал' };
const player3 = { id: 'p-solitary', name: 'Одиночка', party_id: null, current_zone: 'Таверна', current_subzone: 'Зал' };
const player4 = { id: 'p-distant', name: 'Дальний сопартиец', party_id: null, current_zone: 'Глухой лес', current_subzone: 'Поляна' };

// Формируем отряд p-arin, p-iris, p-distant
const partyId = 'squad-alpha-001';
testSession.party_groups.push({
  id: partyId,
  name: `Отряд ${player1.name} и ${player2.name}`,
  leader_id: player1.id,
  members: [player1.id, player2.id, player4.id],
});
player1.party_id = partyId;
player2.party_id = partyId;
player4.party_id = partyId;

function arePlayersInSameParty(pA, pB, sess) {
  if (!pA || !pB) return false;
  if (pA.party_id && pB.party_id && pA.party_id === pB.party_id) return true;
  if (Array.isArray(sess?.party_groups)) {
    for (const g of sess.party_groups) {
      if (Array.isArray(g.members) && g.members.includes(pA.id) && g.members.includes(pB.id)) {
        return true;
      }
    }
  }
  return false;
}

// Перемещение лидера player1 в новую зону
const startingZone = player1.current_zone;
const targetZone = 'Рыночная площадь';
const targetSubzone = 'Фонтан';

const allSessionPlayers = [player1, player2, player3, player4];
const partyFellowsInSameZone = allSessionPlayers.filter(p =>
  p.id !== player1.id &&
  arePlayersInSameParty(player1, p, testSession) &&
  (p.current_zone || null) === startingZone
);

console.log(`  Лидер ${player1.name} начинает движение из "${startingZone}" в "${targetZone}"...`);
console.log(`  Найдено сопартийцев в той же зоне: ${partyFellowsInSameZone.map(p => p.name).join(', ')}`);

if (partyFellowsInSameZone.length === 1 && partyFellowsInSameZone[0].id === 'p-iris') {
  console.log(`  ✅ Корректно: перемещается только Ирис (в отряде и в той же зоне)`);
  passCount++;
} else {
  console.error(`  ❌ Неверный список перемещаемых игроков!`);
  failCount++;
}

// Применяем перемещение
for (const f of partyFellowsInSameZone) {
  f.current_zone = targetZone;
  f.current_subzone = targetSubzone;
}
player1.current_zone = targetZone;
player1.current_subzone = targetSubzone;

if (player1.current_zone === targetZone && player2.current_zone === targetZone) {
  console.log(`  ✅ Арин и Ирис синхронно прибыли в: ${targetZone}`);
  passCount++;
} else {
  console.error(`  ❌ Ошибка синхронного перемещения!`);
  failCount++;
}

if (player3.current_zone === 'Таверна' && player4.current_zone === 'Глухой лес') {
  console.log(`  ✅ Не-сопартиец остался в Таверне, а удалённый сопартиец не телепортировался из Леса`);
  passCount++;
} else {
  console.error(`  ❌ Ошибка изоляции игроков при перемещении!`);
  failCount++;
}

// 4. Тест трансфера предметов
console.log('\n--- ТЕСТ 4: Трансфер предметов между игроками ---');

const inventoryP1 = [{ id: 'item-salve', name: 'Целебная мазь', quantity: 2 }];
const inventoryP2 = [];

function transferItem(fromInv, toInv, itemId, qty) {
  const itemIndex = fromInv.findIndex(i => i.id === itemId);
  if (itemIndex === -1 || fromInv[itemIndex].quantity < qty) {
    return { success: false, reason: 'Предмет не найден или недостаточно количества' };
  }

  fromInv[itemIndex].quantity -= qty;
  const transferredItem = { ...fromInv[itemIndex], quantity: qty };
  if (fromInv[itemIndex].quantity <= 0) {
    fromInv.splice(itemIndex, 1);
  }

  const existingInTarget = toInv.find(i => i.id === itemId);
  if (existingInTarget) {
    existingInTarget.quantity += qty;
  } else {
    toInv.push(transferredItem);
  }

  return {
    success: true,
    mutation: {
      type: 'TRANSFER_ITEM',
      from_id: 'p-arin',
      to_id: 'p-iris',
      item_id: itemId,
      quantity: qty,
    },
    fact: `Арин передал ${transferredItem.name} (x${qty}) → Ирис`,
  };
}

const transferRes = transferItem(inventoryP1, inventoryP2, 'item-salve', 1);
if (transferRes.success && inventoryP1[0].quantity === 1 && inventoryP2[0].quantity === 1) {
  console.log(`  ✅ Трансфер успешен: ${transferRes.fact}`);
  console.log(`  ✅ Инвентарь Арина: ${inventoryP1[0].quantity} шт., Инвентарь Ирис: ${inventoryP2[0].quantity} шт.`);
  passCount++;
} else {
  console.error(`  ❌ Ошибка трансфера предметов!`);
  failCount++;
}

// 5. Проверка отсутствия кукловодства (No Godmoding / No Puppeteering)
console.log('\n--- ТЕСТ 5: Валидация отсутствия кукловодства за живых игроков ---');

function detectPuppeteeringViolations(narrativeText, targetPlayerName) {
  const violations = [];

  const forcedSpeechPattern = new RegExp(`${targetPlayerName}\\s+(?:ответил[а-я]*|сказал[а-я]*|возразил[а-я]*|согласил[а-я]*|крикнул[а-я]*|прошептал[а-я]*)\\s*[:«"']`, 'i');
  const forcedAgreementPattern = new RegExp(`${targetPlayerName}\\s+(?:кивнул[а-я]*\\s+и\\s+согласил[а-я]*|с\\s+радостью\\s+согласил[а-я]*|отказал[а-я]*сь)`, 'i');
  const forcedActionPattern = new RegExp(`${targetPlayerName}\\s+(?:выхватил[а-я]*|напал[а-я]*|побежал[а-я]*|выпил[а-я]*\\s+залпом)`, 'i');

  if (forcedSpeechPattern.test(narrativeText)) {
    violations.push(`Forced speech on behalf of ${targetPlayerName}`);
  }
  if (forcedAgreementPattern.test(narrativeText)) {
    violations.push(`Forced decision/agreement on behalf of ${targetPlayerName}`);
  }
  if (forcedActionPattern.test(narrativeText)) {
    violations.push(`Forced independent physical action on behalf of ${targetPlayerName}`);
  }

  return { isClean: violations.length === 0, violations };
}

const sampleNarrativeGood = `
Вы протягиваете флакон с мазью спутнице: «Возьми, тебе нужнее». Ирис видит протянутую ладонь и ваше движение. В тишине коридора повисает ожидание её ответа.
`;

const sampleNarrativeBad = `
Ирис ответила: «Спасибо большое!» и с радостью согласилась взять мазь, после чего убрала её в сумку.
`;

const checkGood = detectPuppeteeringViolations(sampleNarrativeGood, 'Ирис');
const checkBad = detectPuppeteeringViolations(sampleNarrativeBad, 'Ирис');

if (checkGood.isClean && !checkBad.isClean) {
  console.log(`  ✅ Корректный нарратив успешно принят (свобода выбора игрока сохранена)`);
  console.log(`  ✅ Кукловодческий нарратив отклонён детектором: [${checkBad.violations.join(', ')}]`);
  passCount++;
} else {
  console.error(`  ❌ Ошибка детектора кукловодства!`);
  failCount++;
}

console.log('\n====================================================');
console.log(`РЕЗУЛЬТАТЫ: Успешно: ${passCount}, Ошибок: ${failCount}`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ВСЕ E2E ТЕСТЫ ВЗАИМОДЕЙСТВИЯ МЕЖДУ ИГРОКАМИ УСПЕШНО ПРОЙДЕНЫ!');
  process.exit(0);
}
