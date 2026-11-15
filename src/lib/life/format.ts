import { gregorianToJalali, JMONTHS } from "./jalali";
import type { ItemKind, NotifyMode, SoundId } from "./types";

const DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const WEEK_FULL = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const WEEK_SHORT = ["ی", "د", "س", "چ", "پ", "ج", "ش"];

export const WEEK_OPTIONS = [
  { d: 6, label: "ش", full: "شنبه" },
  { d: 0, label: "ی", full: "یکشنبه" },
  { d: 1, label: "د", full: "دوشنبه" },
  { d: 2, label: "س", full: "سه‌شنبه" },
  { d: 3, label: "چ", full: "چهارشنبه" },
  { d: 4, label: "پ", full: "پنجشنبه" },
  { d: 5, label: "ج", full: "جمعه" },
];

export const KIND_LABEL: Record<ItemKind, string> = {
  wake: "بیداری",
  breakfast: "صبحانه",
  snack: "میان‌وعده",
  lunch: "ناهار",
  preworkout: "قبل از باشگاه",
  gym: "باشگاه",
  dinner: "شام",
  nightsnack: "میان‌وعده شب",
  winddown: "آماده‌سازی خواب",
  sleep: "خواب",
};

export const MODE_LABEL: Record<NotifyMode, string> = {
  normal: "اعلان معمولی",
  loud: "اعلان بلند",
  alarm: "آلارم داخل اپ",
};

export const SOUND_LABEL: Record<SoundId, string> = {
  chime: "زنگ کوتاه",
  bell: "زنگوله",
  soft: "ملایم",
  alarm: "آلارم",
};

export function faNum(value: number | string): string {
  return String(value).replace(/\d/g, (d) => DIGITS[Number(d)] ?? d);
}

export function faFixed(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return faNum(n.toFixed(digits).replace(".", "٫"));
}

export function faInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const body = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return sign + faNum(body);
}

export function faSigned(n: number, digits = 0, suffix = ""): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = digits > 0 ? faFixed(Math.abs(n), digits) : faInt(Math.abs(n));
  return `${sign}${abs}${suffix}`;
}

export function faClock(d: Date, withSeconds = false): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return faNum(withSeconds ? `${h}:${m}:${s}` : `${h}:${m}`);
}

export function faTime(hhmm: string): string {
  return faNum(hhmm);
}

export function faFullDate(d: Date): string {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${WEEK_FULL[d.getDay()]} ${faNum(jd)} ${JMONTHS[jm - 1]} ${faNum(jy)}`;
}

export function faShortDate(d: Date): string {
  const [, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${faNum(jd)} ${JMONTHS[jm - 1].slice(0, 3)}`;
}

export function faDurationHours(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60) % 60;
  if (h <= 0) return `${faNum(m)} دقیقه`;
  if (m === 0) return `${faNum(h)} ساعت`;
  return `${faNum(h)} س ${faNum(m)} د`;
}

export function faRemain(ms: number): string {
  if (ms < -30_000) return "گذشته";
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${faNum(m)} دقیقه`;
  return `${faNum(h)} س ${faNum(m)} د`;
}

export function addMinutesToClock(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h || 0) * 60 + (m || 0) + delta) % 1440 + 1440) % 1440;
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function mealBucket(kind: ItemKind): "صبحانه" | "ناهار" | "شام" | "میان‌وعده" | null {
  if (kind === "breakfast") return "صبحانه";
  if (kind === "lunch") return "ناهار";
  if (kind === "dinner") return "شام";
  if (kind === "snack" || kind === "preworkout" || kind === "nightsnack") return "میان‌وعده";
  return null;
}
