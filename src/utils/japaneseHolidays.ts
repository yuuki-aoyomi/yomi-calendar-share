// Japanese national holidays (modern rules). Dates are evaluated in JST calendar notation.
const nthMonday = (year: number, month: number, nth: number): number => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((8 - first) % 7) + (nth - 1) * 7;
};
const equinox = (year: number, autumn: boolean): number =>
  Math.floor((autumn ? 23.2488 : 20.8431) + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
const key = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const holidayCache = new Map<number, Map<string, string>>();

const holidaysForYear = (year: number): Map<string, string> => {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const holidays = new Map<string, string>();
  const add = (month: number, day: number, name: string) => holidays.set(key(year, month, day), name);
  if (year < 2000 || year > 2099) return holidays;
  add(1, 1, '元日');
  add(1, nthMonday(year, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (year >= 2020) add(2, 23, '天皇誕生日');
  add(3, equinox(year, false), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  add(7, nthMonday(year, 7, 3), '海の日');
  add(8, 11, '山の日');
  add(9, nthMonday(year, 9, 3), '敬老の日');
  add(9, equinox(year, true), '秋分の日');
  add(10, nthMonday(year, 10, 2), 'スポーツの日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  // Exceptional dates for Tokyo Olympics.
  if (year === 2020 || year === 2021) {
    holidays.delete(key(year, 7, nthMonday(year, 7, 3)));
    holidays.delete(key(year, 8, 11));
    holidays.delete(key(year, 10, nthMonday(year, 10, 2)));
    add(7, year === 2020 ? 23 : 22, '海の日');
    add(7, year === 2020 ? 24 : 23, 'スポーツの日');
    add(8, year === 2020 ? 10 : 8, '山の日');
  }
  // Substitute holidays: a Sunday holiday transfers to the first following non-holiday.
  for (const [date] of [...holidays]) {
    const [y, m, d] = date.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) continue;
    let cursor = new Date(Date.UTC(y, m - 1, d + 1));
    while (holidays.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCFullYear() === year) holidays.set(cursor.toISOString().slice(0, 10), '振替休日');
  }
  // Citizens' holiday between two national holidays.
  for (let month = 1; month <= 12; month++) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 2; day < last; day++) {
      const date = key(year, month, day);
      if (holidays.has(date)) continue;
      const before = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
      const after = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      if (holidays.has(before) && holidays.has(after)) holidays.set(date, '国民の休日');
    }
  }
  holidayCache.set(year, holidays);
  return holidays;
};
export const getJapaneseHoliday = (date: string): string | undefined => {
  const year = Number(date.slice(0, 4));
  return holidaysForYear(year).get(date);
};
