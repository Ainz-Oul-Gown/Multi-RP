const fs = require('fs');

const inputPath = 'X:\\MultiRP-AI\\Этерия_input.json';
const outputPath = 'X:\\MultiRP-AI\\Этерия.json';

// Читаем JSON
const input = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(input);

// Исправление 1: folders -> плоский массив строк
if (data.folders && typeof data.folders === 'object' && !Array.isArray(data.folders)) {
  const flatFolders = [];
  if (data.folders.geography) flatFolders.push(...data.folders.geography);
  if (data.folders.bestiary) flatFolders.push(...data.folders.bestiary);
  data.folders = [...new Set(flatFolders)];
  console.log('✓ folders: преобразован в плоский массив');
}

// Исправление 2: Удаляем ruler_id из states
if (data.geography && data.geography.states) {
  data.geography.states.forEach(state => {
    if (state.ruler_id) {
      console.log(`✓ ruler_id удален из state: ${state.name}`);
      delete state.ruler_id;
    }
  });
}

// Исправление 3: race у боссов
if (data.bestiary && data.bestiary.npcs) {
  data.bestiary.npcs.forEach(npc => {
    if (npc.race === 'Монстр') {
      console.log(`✓ race "Монстр" -> "Чудовище" для: ${npc.name}`);
      npc.race = 'Чудовище';
    }
  });
}

// Записываем результат
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`\nJSON сохранен: ${outputPath}`);
console.log(`Размер: ${fs.statSync(outputPath).length} байт`);
