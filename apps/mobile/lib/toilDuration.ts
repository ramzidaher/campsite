export function formatToilMinutes(totalMinutes: number, minutesPerDay = 480): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m === 0) return '0 min';
  if (minutesPerDay > 0 && m >= minutesPerDay && m % minutesPerDay === 0) {
    const d = m / minutesPerDay;
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h} hr`;
  return `${h} hr ${min} min`;
}

export function toilInputToMinutes(
  amount: number,
  unit: 'minutes' | 'hours' | 'days',
  minutesPerDay: number,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (unit === 'minutes') return Math.max(1, Math.round(amount));
  if (unit === 'hours') return Math.max(1, Math.round(amount * 60));
  const mpd = minutesPerDay > 0 ? minutesPerDay : 480;
  return Math.max(1, Math.round(amount * mpd));
}
