// src/utils/npcRaceResolver.js — Интеллектуальное определение расы NPC / монстров
export function resolveNpcRace(npc, categoryParam = '', raceParam = '') {
  if (!npc) return 'Человек';
  const npcObj = typeof npc === 'string' ? { name: npc, category: categoryParam, race: raceParam } : npc;
  const rawRace = (npcObj.race || '').trim();
  const category = (npcObj.category || '').toLowerCase().trim();
  const name = (npcObj.name || '').toLowerCase().trim();
  const tags = Array.isArray(npcObj.status_tags) ? npcObj.status_tags.map((t) => String(t).toLowerCase()) : [];

  // Если раса явно указана и не является ошибочным «Человек» для очевидных монстров/зверей
  const isBeastOrMonster = category === 'beast' || category === 'monster' || category === 'undead' || category === 'construct' || category === 'elemental';
  if (rawRace && !(isBeastOrMonster && (rawRace === 'Человек' || rawRace === 'Human'))) {
    return rawRace;
  }

  // Гуманоидные NPC
  if ((category === 'npc' || category === 'humanoid') && rawRace === 'Человек') {
    if (name.includes('эльф')) return 'Эльф';
    if (name.includes('дварф') || name.includes('гном')) return 'Дварф';
    if (name.includes('орк')) return 'Орк';
    return 'Человек';
  }

  // Специфические расы монстров и созданий
  if (name.includes('гоблин')) return 'Гоблин';
  if (name.includes('орк')) return 'Орк';
  if (name.includes('тролль')) return 'Тролль';
  if (name.includes('минотавр')) return 'Минотавр';
  if (name.includes('мантикора')) return 'Мантикора';
  if (name.includes('гарпи')) return 'Гарпия';
  if (name.includes('энт')) return 'Энт';
  if (name.includes('слизь')) return 'Слизь';
  if (name.includes('черв')) return 'Червь';
  if (name.includes('корнев') || (name.includes('падальщик') && tags.includes('растение'))) return 'Растение-монстр';
  if (name.includes('споровик') || tags.includes('микоид')) return 'Микоид';
  if (name.includes('бес') || name.includes('демон') || tags.includes('демон')) return 'Демон';
  if (/(?:^|\s)лич(?:$|\s)/i.test(name) || name.includes('скелет') || name.includes('упырь') || name.includes('вурдалак') || name.includes('мертвый') || name.includes('нежить') || name.includes('вендиго') || tags.includes('нежить')) return 'Нежить';
  if (name.includes('голем') || tags.includes('конструкт') || tags.includes('голем')) return 'Конструкт';
  if (name.includes('элементаль') || tags.includes('элементаль')) return 'Элементаль';
  if (name.includes('виверн') || name.includes('дракон')) return 'Драконид';
  if (name.includes('василиск') || name.includes('раптор') || name.includes('ящер')) return 'Рептилия';
  if (name.includes('краб')) return 'Ракообразное';
  if (name.includes('паук') || name.includes('клещ') || name.includes('скорпион') || tags.includes('арахнид')) return 'Арахнид';
  if (name.includes('кровосос') || name.includes('жук') || name.includes('комар') || tags.includes('инсектоид') || tags.includes('паразит')) return 'Насекомое';
  if (name.includes('жаба')) return 'Амфибия';
  if (name.includes('волк') || name.includes('койот') || name.includes('вепрь') || name.includes('медведь') || name.includes('гончая') || name.includes('пантера') || name.includes('крыса') || name.includes('мышь')) return 'Зверь';
  if (name.includes('змей') && tags.includes('левиафан')) return 'Морской змей';

  // Дефолт по категории
  if (category === 'beast') return 'Зверь';
  if (category === 'monster') return 'Монстр';
  if (category === 'undead') return 'Нежить';
  if (category === 'construct') return 'Конструкт';
  if (category === 'elemental') return 'Элементаль';

  return rawRace || 'Человек';
}
