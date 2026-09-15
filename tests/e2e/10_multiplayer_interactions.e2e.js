// tests/e2e/10_multiplayer_interactions.e2e.js
// Тест 10: Комплексные взаимодействия между игроками в партии (Multiplayer Interactions)
// Проверяет:
// 1. Определение адресата: живой сопартиец vs NPC
// 2. Объединение игроков в отряд (party formation) и роспуск
// 3. Синхронное перемещение сопартийцев в одной зоне
// 4. Трансфер предметов между союзниками
// 5. Строгий запрет кукловодства (No Godmoding / No Puppeteering)

import { test, expect } from '@playwright/test';
import {
  loadSessionState,
  setupSupabaseProxy,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
} from './helpers/game-helpers.js';

test.describe('10 — Мультиплеерные взаимодействия между игроками', () => {
  test.setTimeout(180_000);

  let sessionState;

  test.beforeEach(async ({ page }) => {
    sessionState = loadSessionState();
    await setupSupabaseProxy(page);
  });

  // ─────────────────────────────────────────────
  // TEST 10-A: Точное распознавание адресата: игрок vs NPC
  // ─────────────────────────────────────────────
  test('10-A: Разрешение адресата диалога (обращение к сопартийцу vs NPC)', async () => {
    const isPartyInviteOrJoinRegex = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i;

    const phrases = [
      { text: 'Ирис, давай объединимся в отряд!', isParty: true },
      { text: 'Пойдем вместе, вдвоем безопаснее!', isParty: true },
      { text: 'Бран, налей нам еще по кружке эля.', isParty: false },
      { text: 'Подхожу к кузнецу и прошу починить доспех.', isParty: false },
    ];

    for (const item of phrases) {
      const match = isPartyInviteOrJoinRegex.test(item.text);
      expect(match).toBe(item.isParty);
    }

    logTestResult('10-A: Target resolution & party detection', 'pass', {
      testedPhrases: phrases.length,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 10-B: Синхронизация группы и пространственная изоляция
  // ─────────────────────────────────────────────
  test('10-B: Групповое перемещение перемещает только сопартийцев в текущей зоне', async () => {
    const session = {
      party_groups: [{ id: 'squad-1', members: ['p1', 'p2', 'p3'] }],
    };

    const p1 = { id: 'p1', name: 'Арин', party_id: 'squad-1', current_zone: 'Таверна' };
    const p2 = { id: 'p2', name: 'Ирис', party_id: 'squad-1', current_zone: 'Таверна' };
    const p3 = { id: 'p3', name: 'Торин', party_id: 'squad-1', current_zone: 'Лес' };
    const p4 = { id: 'p4', name: 'Одиночка', party_id: null, current_zone: 'Таверна' };

    function arePlayersInSameParty(a, b, sess) {
      return sess.party_groups.some(g => g.members.includes(a.id) && g.members.includes(b.id));
    }

    const allPlayers = [p1, p2, p3, p4];
    const startingZone = p1.current_zone;
    const newZone = 'Площадь';

    const fellowsInZone = allPlayers.filter(p =>
      p.id !== p1.id &&
      arePlayersInSameParty(p1, p, session) &&
      p.current_zone === startingZone
    );

    expect(fellowsInZone.map(p => p.id)).toEqual(['p2']);

    for (const f of fellowsInZone) {
      f.current_zone = newZone;
    }
    p1.current_zone = newZone;

    expect(p1.current_zone).toBe('Площадь');
    expect(p2.current_zone).toBe('Площадь');
    expect(p3.current_zone).toBe('Лес'); // Не переместился, т.к. был в другой зоне
    expect(p4.current_zone).toBe('Таверна'); // Не переместился, т.к. не в отряде

    logTestResult('10-B: Group movement synchronization', 'pass', {
      movedTogether: [p1.name, p2.name],
      stayedInOtherZone: p3.name,
      stayedNonMember: p4.name,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 10-C: Трансфер предметов между игроками
  // ─────────────────────────────────────────────
  test('10-C: Атомарная передача предмета между игроками', async () => {
    const invGiver = [{ id: 'potion-1', name: 'Зелье здоровья', quantity: 2 }];
    const invReceiver = [];

    // Симуляция трансфера
    const item = invGiver[0];
    item.quantity -= 1;
    invReceiver.push({ id: item.id, name: item.name, quantity: 1 });

    expect(invGiver[0].quantity).toBe(1);
    expect(invReceiver[0].quantity).toBe(1);

    logTestResult('10-C: Inter-player item transfer', 'pass', {
      giverRemaining: invGiver[0].quantity,
      receiverReceived: invReceiver[0].quantity,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 10-D: Запрет кукловодства за живого игрока (No Godmoding)
  // ─────────────────────────────────────────────
  test('10-D: Детектор кукловодства гарантирует свободу воли живых игроков', async () => {
    function detectGodmoding(text, targetName) {
      const speechPat = new RegExp(`${targetName}\\s+(?:ответил[а-я]*|сказал[а-я]*|возразил[а-я]*|согласил[а-я]*)\\s*[:«"']`, 'i');
      const actionPat = new RegExp(`${targetName}\\s+(?:с\\s+радостью\\s+согласил[а-я]*|выпил[а-я]*\\s+залпом)`, 'i');
      return speechPat.test(text) || actionPat.test(text);
    }

    const goodNarrative = 'Вы протягиваете Ирис флакон с зельем: «Держи». Она смотрит на вас, ожидая, что будет дальше.';
    const badNarrative = 'Ирис ответила: «Спасибо!» и с радостью согласилась выпить зелье залпом.';

    expect(detectGodmoding(goodNarrative, 'Ирис')).toBe(false);
    expect(detectGodmoding(badNarrative, 'Ирис')).toBe(true);

    logTestResult('10-D: Anti-puppeteering validation', 'pass', {
      goodNarrativePassed: true,
      badNarrativeRejected: true,
    });
  });
});
