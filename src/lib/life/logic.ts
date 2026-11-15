import { faFixed, faFullDate, faInt, faRemain, faShortDate, faSigned, faTime, mealBucket, WEEK_SHORT } from "./format";
import type {
  FoodItem,
  LifeData,
  LogEntry,
  MealStatus,
  NotifyMode,
  RangeKey,
  ScheduleItem,
  SwEvent,
  WeightEntry,
} from "./types";

export interface ResolvedItem extends ScheduleItem {
  isGymDay: boolean;
  isRestVariant: boolean;
  displayTitle: string;
  displayDescription: string;
  displayFoods: FoodItem[];
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0, 0, 0);
}

export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, "fa"));
}

export function isGymDay(day: Date, gymDays: number[]): boolean {
  return gymDays.includes(day.getDay());
}

export function itemOccurs(item: ScheduleItem, day: Date): boolean {
  return item.enabled && item.days.includes(day.getDay());
}

export function resolvedItem(item: ScheduleItem, day: Date, profile: LifeData["profile"]): ResolvedItem {
  const gym = isGymDay(day, profile.gymDays);
  const restSnack = item.kind === "preworkout" && !gym;
  const restGym = item.kind === "gym" && !gym;
  return {
    ...item,
    isGymDay: gym,
    isRestVariant: restSnack || restGym,
    displayTitle: restSnack ? item.restTitle || "میان‌وعده عصر" : restGym ? "استراحت" : item.title,
    displayDescription: restSnack
      ? item.restDescription || "روز بدون باشگاه؛ میان‌وعده معمولی."
      : restGym
        ? "امروز جلسه باشگاه نداری."
        : item.description,
    displayFoods: restSnack ? item.restFoods : restGym ? [] : item.foods,
  };
}

export function sumFoods(foods: FoodItem[]): { kcal: number; protein: number } {
  return foods.reduce(
    (acc, f) => ({ kcal: acc.kcal + (Number(f.kcal) || 0), protein: acc.protein + (Number(f.protein) || 0) }),
    { kcal: 0, protein: 0 },
  );
}

export function getEntry(data: LifeData, key: string, itemId: string): LogEntry | undefined {
  return data.logs[key]?.entries[itemId];
}

export function alarmMoment(item: ScheduleItem, entry: LogEntry | undefined, day: Date): number {
  if (entry?.status === "snoozed" && entry.snoozeUntil) return entry.snoozeUntil;
  return atTime(day, item.time).getTime();
}

export function effectiveStatus(
  item: ScheduleItem,
  entry: LogEntry | undefined,
  day: Date,
  now: Date,
  graceMinutes: number,
): MealStatus {
  if (entry?.status === "done") return "done";
  if (entry?.status === "missed") return "missed";
  const moment = alarmMoment(item, entry, day);
  if (entry?.status === "snoozed" && entry.snoozeUntil && now.getTime() < entry.snoozeUntil) return "snoozed";
  if (now.getTime() > moment + graceMinutes * 60_000) return "missed";
  return "pending";
}

export function foodsFor(data: LifeData, day: Date, item: ScheduleItem): FoodItem[] {
  const entry = getEntry(data, dateKey(day), item.id);
  if (entry?.foods && entry.foods.length) return entry.foods;
  return resolvedItem(item, day, data.profile).displayFoods;
}

export function consumedOf(data: LifeData, day: Date, item: ScheduleItem, now: Date): { kcal: number; protein: number } {
  const entry = getEntry(data, dateKey(day), item.id);
  if (effectiveStatus(item, entry, day, now, data.profile.graceMinutes) !== "done") return { kcal: 0, protein: 0 };
  return sumFoods(foodsFor(data, day, item));
}

export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const last = startOfDay(end).getTime();
  for (let d = startOfDay(start); d.getTime() <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

export function rangeWindow(now: Date, range: RangeKey): { start: Date; end: Date; prevStart: Date; prevEnd: Date; len: number } {
  const end = startOfDay(now);
  const len = range === "day" ? 1 : range === "week" ? 7 : 30;
  const start = addDays(end, -(len - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start, end, prevStart, prevEnd, len };
}

export interface DayTally {
  done: number;
  missed: number;
  pending: number;
  snoozed: number;
  total: number;
  kcal: number;
  protein: number;
  plannedKcal: number;
  plannedProtein: number;
  adherence: number;
}

export function tallyDay(data: LifeData, day: Date, now: Date): DayTally {
  const items = sortItems(data.items.filter((item) => itemOccurs(item, day)));
  const tally: DayTally = {
    done: 0,
    missed: 0,
    pending: 0,
    snoozed: 0,
    total: items.length,
    kcal: 0,
    protein: 0,
    plannedKcal: 0,
    plannedProtein: 0,
    adherence: 0,
  };
  for (const item of items) {
    const entry = getEntry(data, dateKey(day), item.id);
    const st = effectiveStatus(item, entry, day, now, data.profile.graceMinutes);
    const planned = sumFoods(resolvedItem(item, day, data.profile).displayFoods);
    tally.plannedKcal += planned.kcal;
    tally.plannedProtein += planned.protein;
    if (st === "done") {
      tally.done += 1;
      const got = sumFoods(foodsFor(data, day, item));
      tally.kcal += got.kcal;
      tally.protein += got.protein;
    } else if (st === "missed") tally.missed += 1;
    else if (st === "snoozed") tally.snoozed += 1;
    else tally.pending += 1;
  }
  tally.adherence = tally.total ? Math.round((tally.done / tally.total) * 100) : 0;
  return tally;
}

export function sumRange(data: LifeData, start: Date, end: Date, now: Date): DayTally {
  const acc: DayTally = {
    done: 0,
    missed: 0,
    pending: 0,
    snoozed: 0,
    total: 0,
    kcal: 0,
    protein: 0,
    plannedKcal: 0,
    plannedProtein: 0,
    adherence: 0,
  };
  for (const day of eachDay(start, end)) {
    const t = tallyDay(data, day, now);
    acc.done += t.done;
    acc.missed += t.missed;
    acc.pending += t.pending;
    acc.snoozed += t.snoozed;
    acc.total += t.total;
    acc.kcal += t.kcal;
    acc.protein += t.protein;
    acc.plannedKcal += t.plannedKcal;
    acc.plannedProtein += t.plannedProtein;
  }
  acc.adherence = acc.total ? Math.round((acc.done / acc.total) * 100) : 0;
  return acc;
}

export function weightAtOrBefore(weights: WeightEntry[], key: string): number | null {
  let best: WeightEntry | null = null;
  for (const w of weights) {
    if (w.date <= key && (!best || w.date > best.date)) best = w;
  }
  return best ? best.kg : null;
}

export function latestWeight(weights: WeightEntry[]): WeightEntry | null {
  return [...weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

export function weightPlateau(weights: WeightEntry[]): boolean {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 3) return false;
  const weeks = new Map<string, number[]>();
  for (const w of sorted) {
    const d = parseDateKey(w.date);
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    const key = dateKey(monday);
    const arr = weeks.get(key) ?? [];
    arr.push(w.kg);
    weeks.set(key, arr);
  }
  const avgs = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, vals]) => vals.reduce((s, n) => s + n, 0) / vals.length);
  if (avgs.length < 3) return false;
  const last = avgs.slice(-3);
  return Math.max(...last) - Math.min(...last) < 0.3;
}

export function sleepHours(bed: string, wake: string): number {
  const ms = new Date(wake).getTime() - new Date(bed).getTime();
  return ms / 3_600_000;
}

export function sleepsIn(data: LifeData, start: Date, end: Date): number[] {
  const a = dateKey(start);
  const b = dateKey(end);
  return data.sleeps
    .filter((s) => s.date >= a && s.date <= b)
    .map((s) => sleepHours(s.bed, s.wake))
    .filter((h) => h > 0 && h < 16);
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function bmi(kg: number, cm: number): number {
  const m = cm / 100;
  if (!m) return 0;
  return kg / (m * m);
}

export interface RingHit {
  tag: string;
  item: ScheduleItem;
  resolved: ResolvedItem;
  date: string;
  moment: number;
  mode: NotifyMode;
}

export function findRinging(data: LifeData, now: Date): RingHit | null {
  let best: RingHit | null = null;
  for (const offset of [0, -1]) {
    const day = addDays(startOfDay(now), offset);
    const key = dateKey(day);
    for (const item of data.items) {
      if (!itemOccurs(item, day)) continue;
      const entry = getEntry(data, key, item.id);
      if (entry?.status === "done" || entry?.status === "missed") continue;
      const moment = alarmMoment(item, entry, day);
      if (entry?.ackedFor === moment) continue;
      const dt = now.getTime() - moment;
      if (dt < 0 || dt > 20 * 60_000) continue;
      if (!best || moment > best.moment) {
        best = {
          tag: `mt2r-sched-${item.id}-${key}-${moment}`,
          item,
          resolved: resolvedItem(item, day, data.profile),
          date: key,
          moment,
          mode: item.notifyMode,
        };
      }
    }
  }
  return best;
}

export interface NextInfo {
  title: string;
  time: string;
  when: number;
  remainMs: number;
  description: string;
  itemId: string;
  date: string;
}

export function nextUp(data: LifeData, now: Date): NextInfo | null {
  for (let i = 0; i < 3; i++) {
    const day = addDays(startOfDay(now), i);
    const key = dateKey(day);
    for (const item of sortItems(data.items.filter((it) => itemOccurs(it, day)))) {
      const entry = getEntry(data, key, item.id);
      if (entry?.status === "done" || entry?.status === "missed") continue;
      const moment = alarmMoment(item, entry, day);
      if (moment >= now.getTime() - 15_000) {
        const resolved = resolvedItem(item, day, data.profile);
        return {
          title: resolved.displayTitle,
          time: new Date(moment).toTimeString().slice(0, 5),
          when: moment,
          remainMs: moment - now.getTime(),
          description: resolved.displayDescription,
          itemId: item.id,
          date: key,
        };
      }
    }
  }
  return null;
}

const VIBRATE: Record<NotifyMode, number[]> = {
  normal: [80],
  loud: [200, 100, 200, 100, 280],
  alarm: [400, 150, 400, 150, 700],
};

export function buildEvents(data: LifeData, now: Date, horizonDays: number): SwEvent[] {
  const out: SwEvent[] = [];
  const horizon = now.getTime() + horizonDays * 86_400_000;
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(startOfDay(now), i);
    const key = dateKey(day);
    for (const item of data.items) {
      if (!itemOccurs(item, day)) continue;
      const entry = getEntry(data, key, item.id);
      if (entry?.status === "done" || entry?.status === "missed") continue;
      const moment = alarmMoment(item, entry, day);
      if (entry?.ackedFor === moment) continue;
      if (moment < now.getTime() - 20 * 60_000) continue;
      if (moment > horizon) continue;
      const resolved = resolvedItem(item, day, data.profile);
      const foodLine = resolved.displayFoods.map((f) => f.name).filter(Boolean).join("، ");
      const body = [resolved.displayDescription, foodLine].filter(Boolean).join(" — ").slice(0, 180);
      out.push({
        tag: `mt2r-sched-${item.id}-${key}-${moment}`,
        when: moment,
        title: resolved.displayTitle,
        body,
        mode: item.notifyMode,
        itemId: item.id,
        date: key,
        snoozeMinutes: data.profile.snoozeMinutes,
        sound: data.profile.sound,
      });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

export function vibratePattern(mode: NotifyMode): number[] {
  return VIBRATE[mode];
}

export interface ChartPoint {
  label: string;
  current: number;
  previous: number;
}

export interface BarRow {
  label: string;
  value: number;
}

export interface KpiModel {
  id: string;
  label: string;
  value: string;
  delta: string;
  tone: "good" | "warn" | "bad" | "neutral";
  spark: number[];
}

export interface TodayRow {
  id: string;
  time: string;
  title: string;
  description: string;
  foods: string;
  status: MealStatus;
  kcal: number;
  protein: number;
  kind: ScheduleItem["kind"];
}

export interface HomeModel {
  kpis: KpiModel[];
  points: ChartPoint[];
  bars: BarRow[];
  barCaption: string;
  chartTitle: string;
  dateLabel: string;
  gym: boolean;
  work: string;
  consumedKcal: number;
  consumedProtein: number;
  plannedKcal: number;
  plannedProtein: number;
  done: number;
  total: number;
  rows: TodayRow[];
  next: NextInfo | null;
  plateau: boolean;
}

function barsFor(data: LifeData, start: Date, end: Date, now: Date, plannedFallback: boolean): { rows: BarRow[]; caption: string } {
  const order = ["صبحانه", "ناهار", "شام", "میان‌وعده"] as const;
  const consumed = new Map<string, number>(order.map((k) => [k, 0]));
  const planned = new Map<string, number>(order.map((k) => [k, 0]));
  for (const day of eachDay(start, end)) {
    for (const item of data.items) {
      if (!itemOccurs(item, day)) continue;
      const bucket = mealBucket(item.kind);
      if (!bucket) continue;
      planned.set(bucket, (planned.get(bucket) ?? 0) + sumFoods(resolvedItem(item, day, data.profile).displayFoods).kcal);
      consumed.set(bucket, (consumed.get(bucket) ?? 0) + consumedOf(data, day, item, now).kcal);
    }
  }
  const used = [...consumed.values()].some((n) => n > 0) && !plannedFallback ? consumed : consumed;
  const anyEaten = [...consumed.values()].some((n) => n > 0);
  const src = anyEaten ? used : planned;
  const rows = order
    .map((label) => ({ label, value: Math.round(src.get(label) ?? 0) }))
    .sort((a, b) => b.value - a.value);
  return { rows, caption: anyEaten ? "کالری مصرف‌شده، تخمینی" : "برنامه کالری، تخمینی" };
}

function sleepTone(avgHours: number | null, target: number): KpiModel["tone"] {
  if (avgHours == null) return "neutral";
  const d = avgHours - target;
  if (d >= -0.4) return "good";
  if (d >= -1) return "warn";
  return "bad";
}

export function buildHomeModel(data: LifeData, now: Date, range: RangeKey): HomeModel {
  const win = rangeWindow(now, range);
  const cur = sumRange(data, win.start, win.end, now);
  const prev = sumRange(data, win.prevStart, win.prevEnd, now);
  const today = startOfDay(now);
  const todayTally = tallyDay(data, today, now);
  const latest = latestWeight(data.weights);
  const before = weightAtOrBefore(data.weights, dateKey(addDays(win.start, -1)));
  const weightDelta = latest && before != null ? latest.kg - before : latest ? latest.kg - data.profile.startWeightKg : null;
  const sleepCur = avg(sleepsIn(data, win.start, win.end));
  const adherenceDelta = cur.adherence - prev.adherence;
  const weightSpark = [...data.weights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)
    .map((w) => w.kg);
  const sleepSpark = sleepsIn(data, addDays(today, -6), today);
  const adhSpark = eachDay(range === "day" ? addDays(today, -6) : win.start, win.end).map(
    (d) => tallyDay(data, d, now).adherence,
  );
  const completion: number[] = [];
  let running = 0;
  const todayItems = sortItems(data.items.filter((item) => itemOccurs(item, today)));
  for (const item of todayItems) {
    const st = effectiveStatus(item, getEntry(data, dateKey(today), item.id), today, now, data.profile.graceMinutes);
    if (st === "done") running += 1;
    completion.push(running);
  }

  const next = nextUp(data, now);
  const points = chartPoints(data, now, range);
  const barPack = barsFor(data, win.start, win.end, now, false);

  const kpis: KpiModel[] = [
    {
      id: "weight",
      label: "وزن",
      value: latest ? faFixed(latest.kg) : "—",
      delta: weightDelta == null ? "بدون ثبت" : `${faSigned(weightDelta, 1)} کیلو`,
      tone: weightDelta == null ? "neutral" : weightDelta >= 0 ? "good" : "bad",
      spark: weightSpark.length >= 2 ? weightSpark : [data.profile.startWeightKg, latest?.kg ?? data.profile.startWeightKg],
    },
    {
      id: "next",
      label: next ? next.title : "وعده بعد",
      value: next ? faTime(next.time) : "—",
      delta: next ? faRemain(next.remainMs) : "تمام شد",
      tone: "neutral",
      spark: completion.length >= 2 ? completion : [0, todayTally.done],
    },
    {
      id: "sleep",
      label: range === "day" ? "خواب دیشب" : "میانگین خواب",
      value: faDurationLabel(sleepCur),
      delta: sleepCur == null ? "ثبت نشده" : `${faSigned(sleepCur - data.profile.sleepTargetHours, 1)} از هدف`,
      tone: sleepTone(sleepCur, data.profile.sleepTargetHours),
      spark: sleepSpark.length >= 2 ? sleepSpark : [data.profile.sleepTargetHours, sleepCur ?? data.profile.sleepTargetHours],
    },
    {
      id: "adherence",
      label: "پایبندی",
      value: `${faInt(cur.adherence)}٪`,
      delta: `${faSigned(adherenceDelta)}٪`,
      tone: adherenceDelta > 0 ? "good" : adherenceDelta < 0 ? "bad" : "neutral",
      spark: adhSpark.length >= 2 ? adhSpark : [prev.adherence, cur.adherence],
    },
  ];

  const rows: TodayRow[] = todayItems.map((item) => {
    const resolved = resolvedItem(item, today, data.profile);
    const entry = getEntry(data, dateKey(today), item.id);
    const status = effectiveStatus(item, entry, today, now, data.profile.graceMinutes);
    const foods = foodsFor(data, today, item);
    const sums = sumFoods(foods);
    return {
      id: item.id,
      time: item.time,
      title: resolved.displayTitle,
      description: resolved.displayDescription,
      foods: foods.map((f) => f.name).filter(Boolean).join("، "),
      status,
      kcal: Math.round(status === "done" ? sums.kcal : sumFoods(resolved.displayFoods).kcal),
      protein: Math.round((status === "done" ? sums.protein : sumFoods(resolved.displayFoods).protein) * 10) / 10,
      kind: item.kind,
    };
  });

  return {
    kpis,
    points,
    bars: barPack.rows,
    barCaption: barPack.caption,
    chartTitle: range === "day" ? "کالری تجمعی وعده‌ها" : range === "week" ? "کالری روزانه" : "روند وزن",
    dateLabel: faFullDate(now),
    gym: isGymDay(today, data.profile.gymDays),
    work: data.profile.workArrival,
    consumedKcal: todayTally.kcal,
    consumedProtein: todayTally.protein,
    plannedKcal: todayTally.plannedKcal,
    plannedProtein: todayTally.plannedProtein,
    done: todayTally.done,
    total: todayTally.total,
    rows,
    next,
    plateau: weightPlateau(data.weights),
  };
}

function faDurationLabel(hours: number | null): string {
  if (hours == null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60) % 60;
  return m === 0 ? `${faInt(h)} ساعت` : `${faInt(h)}:${String(m).padStart(2, "0").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}`;
}

function chartPoints(data: LifeData, now: Date, range: RangeKey): ChartPoint[] {
  if (range === "month") {
    const win = rangeWindow(now, "month");
    const days = eachDay(win.start, win.end);
    const prevDays = eachDay(win.prevStart, win.prevEnd);
    return days.map((day, i) => ({
      label: faShortDate(day),
      current: weightAtOrBefore(data.weights, dateKey(day)) ?? data.profile.startWeightKg,
      previous: weightAtOrBefore(data.weights, dateKey(prevDays[i] ?? addDays(day, -30))) ?? data.profile.startWeightKg,
    }));
  }
  if (range === "week") {
    const win = rangeWindow(now, "week");
    return eachDay(win.start, win.end).map((day) => ({
      label: WEEK_SHORT[day.getDay()],
      current: Math.round(tallyDay(data, day, now).kcal),
      previous: Math.round(tallyDay(data, addDays(day, -7), now).kcal),
    }));
  }
  const today = startOfDay(now);
  const yday = addDays(today, -1);
  const items = sortItems(data.items.filter((item) => itemOccurs(item, today)));
  let c = 0;
  let p = 0;
  return items.map((item) => {
    c += consumedOf(data, today, item, now).kcal;
    const mirror = data.items.find((it) => it.id === item.id);
    p += mirror ? consumedOf(data, yday, mirror, now).kcal : 0;
    return {
      label: resolvedItem(item, today, data.profile).displayTitle.replace("بیدار شدن و نوشیدن آب", "بیداری").replace("وعده بعد باشگاه / شام", "شام").replace("آماده‌سازی خواب", "آماده‌خواب"),
      current: Math.round(c),
      previous: Math.round(p),
    };
  });
}

export interface ReportModel {
  adherence: number;
  done: number;
  missed: number;
  total: number;
  sleepAvg: number | null;
  weightDelta: number | null;
  latest: number | null;
  goal: number;
  start: number;
  gymDone: number;
  gymPlanned: number;
  regularity: number;
  prevRegularity: number;
  points: ChartPoint[];
  insights: string[];
}

function regularityScore(adherence: number, sleepAvg: number | null, logged: number, days: number): number {
  const sleepScore = sleepAvg == null ? 45 : Math.max(0, 100 - Math.abs(sleepAvg - 8) * 28);
  const logScore = days ? (logged / days) * 100 : 0;
  return Math.round(adherence * 0.55 + sleepScore * 0.3 + logScore * 0.15);
}

export function buildReport(data: LifeData, now: Date, range: RangeKey): ReportModel {
  const win = rangeWindow(now, range);
  const cur = sumRange(data, win.start, win.end, now);
  const prev = sumRange(data, win.prevStart, win.prevEnd, now);
  const days = eachDay(win.start, win.end);
  const sleepList = sleepsIn(data, win.start, win.end);
  const sleepAvg = avg(sleepList);
  const latest = latestWeight(data.weights);
  const before = weightAtOrBefore(data.weights, dateKey(addDays(win.start, -1)));
  const weightDelta = latest && before != null ? latest.kg - before : null;
  const gym = data.items.find((i) => i.id === "gym");
  let gymPlanned = 0;
  let gymDone = 0;
  let logged = 0;
  for (const day of days) {
    const key = dateKey(day);
    const t = tallyDay(data, day, now);
    if (t.done > 0 || data.sleeps.some((s) => s.date === key) || data.weights.some((w) => w.date === key)) logged += 1;
    if (data.profile.gymDays.includes(day.getDay())) {
      gymPlanned += 1;
      if (gym) {
        const st = effectiveStatus(gym, getEntry(data, key, gym.id), day, now, data.profile.graceMinutes);
        if (st === "done") gymDone += 1;
      }
    }
  }
  const prevDays = eachDay(win.prevStart, win.prevEnd);
  let prevLogged = 0;
  for (const day of prevDays) {
    const key = dateKey(day);
    if (tallyDay(data, day, now).done > 0 || data.sleeps.some((s) => s.date === key)) prevLogged += 1;
  }
  const regularity = regularityScore(cur.adherence, sleepAvg, logged, days.length);
  const prevRegularity = regularityScore(prev.adherence, avg(sleepsIn(data, win.prevStart, win.prevEnd)), prevLogged, prevDays.length);
  const points: ChartPoint[] =
    range === "day"
      ? chartPoints(data, now, "day")
      : days.map((day, i) => ({
          label: range === "week" ? WEEK_SHORT[day.getDay()] : faShortDate(day),
          current: tallyDay(data, day, now).adherence,
          previous: tallyDay(data, prevDays[i] ?? addDays(day, -win.len), now).adherence,
        }));
  const insights: string[] = [];
  insights.push(
    cur.total
      ? `از ${faInt(cur.total)} یادآوری این بازه، ${faInt(cur.done)} تا انجام شده و ${faInt(cur.missed)} تا از دست رفته.`
      : "در این بازه برنامه‌ای فعال نیست.",
  );
  insights.push(
    sleepAvg == null
      ? "خوابی ثبت نشده. ساعت خواب و بیداری را در بخش خواب وارد کن."
      : `میانگین خواب ${faFixed(sleepAvg)} ساعت است؛ هدف ${faFixed(data.profile.sleepTargetHours, 0)} ساعت.`,
  );
  if (weightDelta != null && latest) {
    insights.push(
      weightDelta >= 0.2
        ? `وزن حدود ${faFixed(weightDelta)} کیلو نسبت به ابتدای بازه بالا رفته و روی ${faFixed(latest.kg)} است.`
        : weightDelta <= -0.2
          ? `وزن حدود ${faFixed(Math.abs(weightDelta))} کیلو پایین آمده. برای افزایش وزن، وعده‌های ازدست‌رفته را جدی‌تر بگیر.`
          : `وزن تقریباً ثابت مانده (${faFixed(latest.kg)} کیلو).`,
    );
  }
  insights.push(`باشگاه: ${faInt(gymDone)} از ${faInt(gymPlanned)} روز برنامه‌ریزی‌شده انجام شده.`);
  const diff = regularity - prevRegularity;
  insights.push(
    diff > 3
      ? `نظم سبک زندگی نسبت به بازه قبل ${faInt(diff)} واحد بهتر شده.`
      : diff < -3
        ? `نظم نسبت به بازه قبل ${faInt(Math.abs(diff))} واحد افت کرده.`
        : "نظم این بازه نزدیک به بازه قبل است.",
  );
  return {
    adherence: cur.adherence,
    done: cur.done,
    missed: cur.missed,
    total: cur.total,
    sleepAvg,
    weightDelta,
    latest: latest?.kg ?? null,
    goal: data.profile.goalWeightKg,
    start: data.profile.startWeightKg,
    gymDone,
    gymPlanned,
    regularity,
    prevRegularity,
    points,
    insights,
  };
}

export function shiftClock(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h || 0) * 60 + (m || 0) + delta) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
