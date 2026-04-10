export function getNextDatesForDay(targetDay: number, count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  while (dates.length < count) {
    if (d.getUTCDay() === targetDay) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}
