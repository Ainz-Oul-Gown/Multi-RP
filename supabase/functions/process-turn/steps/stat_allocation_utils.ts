// supabase/functions/process-turn/steps/stat_allocation_utils.ts

/**
 * Парсинг намерения прокачки характеристик из текста чата
 */
export function parseStatAllocationIntent(text: string): { stat: string; points: number } | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();

  const statMap: Record<string, string> = {
    "сил": "STR", "str": "STR", "strength": "STR",
    "ловк": "DEX", "dex": "DEX", "dexterity": "DEX",
    "вынос": "CON", "con": "CON", "constitution": "CON", "тело": "CON",
    "интел": "INT", "int": "INT", "intelligence": "INT", "ум": "INT",
    "мудр": "WIS", "wis": "WIS", "wisdom": "WIS",
    "хариз": "CHA", "cha": "CHA", "charisma": "CHA", "обаяни": "CHA"
  };

  // Шаблон 1: глагол + количество + характеристика
  // "вкладываю 2 очка в силу", "качаю ловкость +1", "добавь 2 в выносливость", "повысь мудрость на 1"
  const verbRegex = /(?:вкладываю|вкачиваю|качаю|повышаю|добавь|распредели|кинь|увеличь|подними|повысь|поставь)\s*(?:себе)?\s*(\+?\d+)?\s*(?:очка|очко|очков|ед|пт|поинт[а-я]*)?\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match1 = clean.match(verbRegex);
  if (match1) {
    const rawPts = match1[1] ? parseInt(match1[1].replace("+", ""), 10) : 1;
    const rawStat = match1[2].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 2: характеристика + количество ("ловкость +1", "сила 2", "интеллект +2")
  const statFirstRegex = /([а-яa-z]+)\s*(?:\+|\bплюс\b|\bна\b)?\s*(\d+)\s*(?:очка|очко|очков|ед|пт|поинт[а-я]*)?/i;
  const match2 = clean.match(statFirstRegex);
  if (match2) {
    const rawStat = match2[1].toLowerCase();
    const rawPts = parseInt(match2[2], 10);
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 3: +N характеристика ("+1 сила", "+2 выносливость")
  const plusFirstRegex = /\+(\d+)\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match3 = clean.match(plusFirstRegex);
  if (match3) {
    const rawPts = parseInt(match3[1], 10);
    const rawStat = match3[2].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 4: глагол + характеристика без цифр ("качаю силу", "повысь ловкость" -> 1 очко)
  const simpleRegex = /(?:вкладываю|вкачиваю|качаю|повышаю|увеличь|подними|повысь)\s*(?:себе)?\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match4 = clean.match(simpleRegex);
  if (match4) {
    const rawStat = match4[1].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: 1 };
      }
    }
  }

  return null;
}
