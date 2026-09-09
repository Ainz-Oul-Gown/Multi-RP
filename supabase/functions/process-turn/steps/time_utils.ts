// supabase/functions/process-turn/steps/time_utils.ts

/**
 * Утилиты времени (для fallback в GPS, если Шаг 1.6 не вызывается)
 */
export function advanceTime(base: { year: number; month: number; day: number; hour: number; minute: number }, addMinutes: number) {
  let totalMin = (base.hour * 60 + base.minute + addMinutes);
  let day = base.day, month = base.month, year = base.year;
  const minutesInDay = 24 * 60;
  while (totalMin >= minutesInDay) {
    totalMin -= minutesInDay;
    day++;
    if (day > 30) { day = 1; month++; if (month > 12) { month = 1; year++; } }
  }
  return { year, month, day, hour: Math.floor(totalMin / 60), minute: totalMin % 60 };
}
