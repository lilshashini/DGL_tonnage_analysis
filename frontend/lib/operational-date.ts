/** SQL ETDs without an offset are station-local wall-clock values. */
const STATIONS: Record<string, string> = {
  IND: "Asia/Kolkata", CMB: "Asia/Colombo", VNM: "Asia/Ho_Chi_Minh",
  DAC: "Asia/Dhaka", PKI: "Asia/Karachi", NYC: "America/New_York",
};
const COUNTRIES: Record<string, string> = {
  india: "Asia/Kolkata", "sri lanka": "Asia/Colombo", vietnam: "Asia/Ho_Chi_Minh",
  "viet nam": "Asia/Ho_Chi_Minh", bangladesh: "Asia/Dhaka", pakistan: "Asia/Karachi",
};

export function operationalDay(value: unknown, company?: string, country?: string): string {
  let raw = String(value ?? "");
  if (typeof value === "number" || /^\d{9,16}$/.test(raw.trim())) {
    const num = Number(value);
    const ms = num > 1e11 ? num : num * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      raw = d.toISOString();
    }
  }
  const day = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!day || Number.isNaN(Date.parse(day + "T00:00:00Z"))) return "";
  const zone = STATIONS[String(company || "").toUpperCase()] || COUNTRIES[String(country || "").toLowerCase()];
  // Do not reinterpret a naive SQL timestamp in the browser/server timezone.
  if (!/[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) || !zone) return day;
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** UTC is used only for calendar arithmetic after choosing the station day. */
export function freightEtdDate(row: any, mode: "AIR" | "SEA"): Date {
  let value = row.ETD ?? row.etd ?? row.etd_date;
  if (typeof value === "string" && /^\d{9,16}$/.test(value.trim())) {
    value = Number(value);
  }
  if (typeof value === "number") {
    value = value > 1e11 ? value : value * 1000;
  }
  if (mode === "AIR") return new Date(value);
  const day = operationalDay(value, row.Company_Code ?? row.Company, row.Origin_Country);
  return day ? new Date(day + "T00:00:00Z") : new Date(NaN);
}

export function freightDayParts(date: Date, mode: "AIR" | "SEA") {
  return mode === "SEA"
    ? {year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay()}
    : {year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), weekday: date.getDay()};
}

export function freightIsoWeek(date: Date, mode: "AIR" | "SEA") {
  const thursday = new Date(date.valueOf());
  let firstWeek: Date, weekday: number, year: number;
  if (mode === "SEA") {
    thursday.setUTCHours(0, 0, 0, 0);
    thursday.setUTCDate(thursday.getUTCDate() + 3 - (thursday.getUTCDay() + 6) % 7);
    year = thursday.getUTCFullYear();
    firstWeek = new Date(Date.UTC(year, 0, 4));
    weekday = firstWeek.getUTCDay();
  } else {
    thursday.setHours(0, 0, 0, 0);
    thursday.setDate(thursday.getDate() + 3 - (thursday.getDay() + 6) % 7);
    year = date.getFullYear();
    firstWeek = new Date(thursday.getFullYear(), 0, 4);
    weekday = firstWeek.getDay();
  }
  const week = 1 + Math.round(((thursday.valueOf() - firstWeek.valueOf()) / 86400000 - 3 + (weekday + 6) % 7) / 7);
  return { year, week, sortKey: `${year}-${String(week).padStart(2, "0")}` };
}
