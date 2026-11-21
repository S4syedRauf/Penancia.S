export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr);
  d.setDate(d.getDate() + days);
  return formatISODate(d);
}

export interface WeekDayInfo {
  dateStr: string;
  dayLetter: string; // M, T, W, T, F, S, S
  dayNumber: number;
  dayName: string;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getWeekDays(anchorDateStr: string): WeekDayInfo[] {
  const anchor = parseISODate(anchorDateStr);
  const jsDay = anchor.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dateStr: formatISODate(d),
      dayLetter: DAY_LETTERS[i],
      dayNumber: d.getDate(),
      dayName: DAY_NAMES[i],
    };
  });
}

export function getMonthDays(year: number, monthIndex: number): (string | null)[] {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const jsDay = firstDay.getDay();
  const leadingEmpty = jsDay === 0 ? 6 : jsDay - 1; // Monday-first grid

  const cells: (string | null)[] = Array(leadingEmpty).fill(null);
  for (let day = 1; day <= lastDay.getDate(); day++) {
    cells.push(formatISODate(new Date(year, monthIndex, day)));
  }
  return cells;
}

export function formatHumanDate(dateStr: string): string {
  const d = parseISODate(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatHourLabel(hour24: number): { time: string; period: string } {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    time: `${h12}:00`,
    period,
  };
}

export function formatDotTimeRange(start: string, end: string): string {
  return `${start.replace(':', '.')} - ${end.replace(':', '.')}`;
}

export function calcDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return Math.max(5, diff);
}
