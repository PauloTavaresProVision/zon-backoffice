// Formatação partilhada pelo servidor e pelo browser. Datas no fuso de Luanda.
export const TZ = "Africa/Luanda";
const NB = " ";

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
export const kz = (n: number) => int(n) + NB + "Kz";
export const dec = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
export const mkz = (n: number) => dec(n / 1_000_000) + NB + "M" + NB + "Kz";
export const pct = (n: number, d = 1) => (Number.isFinite(n) ? dec(n, d) : "0") + "%";
const pad = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" de hoje (ou de um instante) em Luanda. */
export function isoDay(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "AAAA-MM-DD HH:MM:SS" em Luanda, o formato que o OfficeGest usa. */
export function ogDateTime(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date((dayNum(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}

export const daysFrom = (iso: string, today = isoDay()) => Math.round(dayNum(iso.slice(0, 10)) - dayNum(today));

export function date(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const iso = typeof v === "string" ? v.slice(0, 10) : isoDay(v);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function dateTime(v: Date | null | undefined): string {
  if (!v) return "—";
  const s = ogDateTime(v);
  return `${date(s)}, ${s.slice(11, 16)}`;
}

export function rel(iso: string | null | undefined, today = isoDay()): string {
  if (!iso) return "";
  const n = daysFrom(iso, today);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

export function ago(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return "nunca";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const dd = Math.round(h / 24);
  return `há ${dd} dia${dd === 1 ? "" : "s"}`;
}

export function longToday(d: Date = new Date()): string {
  const iso = isoDay(d);
  const wd = new Date(iso + "T12:00:00Z").getUTCDay();
  return `${WEEKDAYS[wd]}, ${+iso.slice(8, 10)} de ${MONTHS_LONG[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;
}

export function greeting(d: Date = new Date()): string {
  const h = +ogDateTime(d).slice(11, 13);
  return h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite";
}

/** "2026-10" → "outubro 2026" */
export function monthLabel(ym: string, long = true): string {
  const m = +ym.slice(5, 7) - 1;
  return `${(long ? MONTHS_LONG : MONTHS)[m]} ${ym.slice(0, 4)}`;
}

/** "2026-10" + 1 → "2026-11" */
export function shiftMonth(ym: string, n: number): string {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Milhões com as casas decimais que fazem falta: 0,48 M · 12,5 M · 60 M */
export function millions(n: number): string {
  const m = n / 1_000_000;
  return dec(m, m >= 100 ? 0 : m >= 10 ? 1 : 2);
}

/** Rótulo curto para eixos: 250 mil · 1,5 M */
export function compactKz(n: number): string {
  const short = (v: number) => dec(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2);
  if (n >= 1_000_000) return `${short(n / 1_000_000)}${NB}M`;
  if (n >= 1_000) return `${short(n / 1_000)}${NB}mil`;
  return int(n);
}

export const refFmt = (r: string) => r.replace(/^(\d{3})(\d{3})(\d{3})$/, `$1${NB}$2${NB}$3`);

export function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const phoneFmt = (p: string | null | undefined) => (p ? p.replace(/^(\d{3})(\d{3})(\d{3})$/, `$1${NB}$2${NB}$3`) : "—");

export const pdfFileName = (documentNumber: string) => `Fatura_${documentNumber.replace(/[^\w-]+/g, "_")}.pdf`;
