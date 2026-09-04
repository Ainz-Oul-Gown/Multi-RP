// src/utils/gameDate.js — Форматирование игрового календаря и времени
export function formatGameCalendarDate(day, month, year, hour = 10, minute = 0) {
  if (!day || !month || !year) return "";
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];
  const mIndex = Math.max(1, Math.min(12, Number(month))) - 1;
  const monthName = months[mIndex];
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${day} ${monthName} ${year} г., ${timeStr}`;
}
