// src/utils/dice.js — Утилита проверки результатов
// Вся математика бросков выполняется на сервере (Supabase RPC).
// Этот модуль предоставляет клиентские хелперы для отображения результатов.

// Форматирование результата броска для отображения
export function formatRollResult(rollData) {
  if (!rollData || rollData.type === 'none') return null;

  const success = rollData.success;
  const label = success ? 'УСПЕХ' : 'ПРОВАЛ';

  let detail = '';
  if (rollData.type === 'advantage') {
    detail = `Лучший результат`;
  } else if (rollData.type === 'disadvantage') {
    detail = `Худший результат`;
  }

  return {
    success,
    label,
    detail,
    total: rollData.total,
    difficulty: rollData.difficulty,
    skill: rollData.skill,
  };
}

// Получение текстового описания результата для нарратива
export function getNarrativeTone(success, margin) {
  if (success) {
    if (margin >= 5) return 'уверенный успех';
    if (margin >= 2) return 'успешное действие';
    return 'еле преуспел';
  }
  if (margin <= 2) return 'почти получилось';
  if (margin <= 5) return 'заметный провал';
  return 'катастрофический провал';
}
