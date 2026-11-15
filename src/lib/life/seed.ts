import { createDefaultItems, defaultProfile } from "./defaults";
import { addDays, atTime, dateKey, itemOccurs, startOfDay } from "./logic";
import type { DayLog, LifeData, Profile, ScheduleItem, SleepEntry, WeightEntry } from "./types";

function mix(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function cloneProfile(profile: Profile = defaultProfile): Profile {
  return { ...profile, gymDays: [...profile.gymDays] };
}

export function cloneItems(items: ScheduleItem[] = createDefaultItems()): ScheduleItem[] {
  return items.map((item) => ({
    ...item,
    days: [...item.days],
    foods: item.foods.map((f) => ({ ...f })),
    restFoods: item.restFoods.map((f) => ({ ...f })),
  }));
}

export function buildSeed(now: Date): Pick<LifeData, "logs" | "weights" | "sleeps"> & { seeded: true } {
  const profile = defaultProfile;
  const items = createDefaultItems();
  const logs: Record<string, DayLog> = {};
  for (let ago = 13; ago >= 0; ago--) {
    const day = addDays(startOfDay(now), -ago);
    const key = dateKey(day);
    const entries: DayLog["entries"] = {};
    for (const item of items) {
      if (!itemOccurs(item, day)) continue;
      const moment = atTime(day, item.time).getTime();
      if (moment > now.getTime() - profile.graceMinutes * 60_000) continue;
      const roll = mix(`${key}:${item.id}`);
      const status = roll > 0.18 ? "done" : "missed";
      entries[item.id] = {
        status,
        note: "",
        updatedAt: moment,
        ackedFor: moment,
        snoozeUntil: null,
      };
    }
    if (Object.keys(entries).length) logs[key] = { date: key, entries };
  }

  const weights: WeightEntry[] = [];
  for (let w = 8; w >= 0; w--) {
    const day = addDays(startOfDay(now), -w * 7);
    const kg = Math.round((52 + (8 - w) * 0.16) * 10) / 10;
    weights.push({
      id: `w-${dateKey(day)}`,
      date: dateKey(day),
      kg,
      note: w === 0 ? "آخرین توزین نمونه" : "",
    });
  }

  const sleeps: SleepEntry[] = [];
  for (let ago = 10; ago >= 0; ago--) {
    const wakeDay = addDays(startOfDay(now), -ago);
    const key = dateKey(wakeDay);
    const bedMin = 23 * 60 + Math.floor(mix(key + "b") * 40);
    const wakeMin = 6 * 60 + 45 + Math.floor(mix(key + "w") * 30);
    const bed = new Date(wakeDay);
    bed.setDate(bed.getDate() - 1);
    bed.setHours(Math.floor(bedMin / 60), bedMin % 60, 0, 0);
    const wake = new Date(wakeDay);
    wake.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
    if (wake.getTime() > now.getTime()) continue;
    sleeps.push({
      id: `s-${key}`,
      date: key,
      bed: bed.toISOString(),
      wake: wake.toISOString(),
      note: "",
    });
  }

  return { logs, weights, sleeps, seeded: true };
}
