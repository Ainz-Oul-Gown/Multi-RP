-- Реальные значения role + background у NPC (не боссы)
SELECT DISTINCT role, category, name, LEFT(background, 80) as bg
FROM npcs 
WHERE category != 'boss'
ORDER BY role, category
LIMIT 30;
