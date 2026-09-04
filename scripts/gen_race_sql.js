import fs from 'fs';
const data = JSON.parse(fs.readFileSync('Этерия.json', 'utf8'));

const sqlStatements = [];
for (const npc of data.bestiary.npcs) {
  const safeName = npc.name.replace(/'/g, "''");
  const safeRace = (npc.race || 'Человек').replace(/'/g, "''");
  const hostile = npc.is_hostile ? 'true' : 'false';
  sqlStatements.push(`UPDATE npcs SET race = '${safeRace}', is_hostile = ${hostile} WHERE name = '${safeName}';`);
}

fs.writeFileSync('scratch_update_races.sql', sqlStatements.join('\n'), 'utf8');
console.log('Wrote scratch_update_races.sql with', sqlStatements.length, 'statements');
