export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function parseISO(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function addDays(dateStr: string, days: number): string {
  const dt = parseISO(dateStr);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
}

export function getMondayOfWeek(dateStr: string): string {
  const dt = parseISO(dateStr);
  const day = dt.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toISO(dt);
}

export function getWeekDates(anchorDateStr: string): string[] {
  const monday = getMondayOfWeek(anchorDateStr);
  return Array.from({length: 7}, (_, i) => addDays(monday, i));
}

export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Math.max(0, Math.min(1440, (h || 0) * 60 + (m || 0)));
}

export function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  if (clamped === 1440) return '24:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${pad2(m)}`;
}

const WEEKDAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const WEEKDAYS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function getWeekdayShort(dateStr: string): string {
  return WEEKDAYS_SHORT[parseISO(dateStr).getDay()];
}

export function getWeekdayLong(dateStr: string): string {
  return WEEKDAYS_LONG[parseISO(dateStr).getDay()];
}

export function getDayNumber(dateStr: string): number {
  return parseISO(dateStr).getDate();
}

export function formatMonthYear(dateStr: string): string {
  const dt = parseISO(dateStr);
  const m = MONTHS_LONG[dt.getMonth()];
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${dt.getFullYear()}`;
}

export function formatDateShortFr(dateStr: string): string {
  const dt = parseISO(dateStr);
  const dayName = WEEKDAYS_SHORT[dt.getDay()];
  const month = MONTHS_LONG[dt.getMonth()].slice(0, 4);
  return `${dayName} ${dt.getDate()} ${month}`;
}

export function formatWeekRangeFr(weekDates: string[]): string {
  if (weekDates.length === 0) return '';
  const first = parseISO(weekDates[0]);
  const last = parseISO(weekDates[weekDates.length - 1]);
  const m1 = MONTHS_LONG[first.getMonth()];
  const m2 = MONTHS_LONG[last.getMonth()];
  if (first.getMonth() === last.getMonth()) {
    const cap = m1.charAt(0).toUpperCase() + m1.slice(1);
    return `${first.getDate()} – ${last.getDate()} ${cap} ${last.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getDate()} ${m1.slice(0, 4)} – ${last.getDate()} ${m2.slice(0, 4)} ${last.getFullYear()}`;
  }
  return `${first.getDate()} ${m1.slice(0, 4)} ${first.getFullYear()} – ${last.getDate()} ${m2.slice(0, 4)} ${last.getFullYear()}`;
}

export function getMonthCalendarGrid(year: number, monthIndex: number): Array<{date: string; inMonth: boolean}> {
  const firstOfMonth = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const startDay = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const offset = startDay === 0 ? -6 : 1 - startDay;
  const gridStart = new Date(year, monthIndex, 1 + offset, 12, 0, 0, 0);
  const cells: Array<{date: string; inMonth: boolean}> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: toISO(d),
      inMonth: d.getMonth() === monthIndex,
    });
  }
  return cells;
}

export function addMonths(dateStr: string, months: number): string {
  const dt = parseISO(dateStr);
  const day = dt.getDate();
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + months);
  const maxDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(day, maxDay));
  return toISO(dt);
}

export function formatDateRangeShortFr(startDateStr: string, endDateStr: string): string {
  const d1 = parseISO(startDateStr);
  const d2 = parseISO(endDateStr);
  const m1 = MONTHS_LONG[d1.getMonth()].slice(0, 4);
  const m2 = MONTHS_LONG[d2.getMonth()].slice(0, 4);
  if (d1.getFullYear() === d2.getFullYear()) {
    if (d1.getMonth() === d2.getMonth()) {
      const fullM = MONTHS_LONG[d1.getMonth()];
      const cap = fullM.charAt(0).toUpperCase() + fullM.slice(1);
      return `${d1.getDate()} – ${d2.getDate()} ${cap} ${d2.getFullYear()}`;
    }
    return `${d1.getDate()} ${m1} – ${d2.getDate()} ${m2} ${d2.getFullYear()}`;
  }
  return `${d1.getDate()} ${m1} ${d1.getFullYear()} – ${d2.getDate()} ${m2} ${d2.getFullYear()}`;
}

export function diffDaysInclusive(startDateStr: string, endDateStr: string): number {
  const s = parseISO(startDateStr).getTime();
  const e = parseISO(endDateStr).getTime();
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

