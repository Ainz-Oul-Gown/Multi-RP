SELECT p.id, p.name, p.hp, p.max_hp, p.level, p.stats,
       p.current_zone, p.subzone_id, p.user_id,
       s.current_location_id, l.name as loc_name, l.danger_level
FROM players p
JOIN sessions s ON s.id = p.session_id
LEFT JOIN locations l ON l.id = s.current_location_id
WHERE p.session_id = 'e1b0c960-b2cb-4d24-a6d2-015eb0fd6ee8';
