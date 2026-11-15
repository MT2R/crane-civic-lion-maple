import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildSeed, cloneItems, cloneProfile } from "./seed";
import { alarmMoment, isValidTime, resolvedItem, shiftClock } from "./logic";
import type { FoodItem, InboxEvent, LifeData, LogEntry, MealStatus, Profile, ScheduleItem, SleepEntry, WeightEntry } from "./types";

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export interface LifeState extends LifeData {
  seeded: boolean;
  onboarded: boolean;
  appliedEventIds: string[];
  updateProfile: (patch: Partial<Profile>) => void;
  updateItem: (id: string, patch: Partial<ScheduleItem>) => void;
  addItem: () => string;
  removeItem: (id: string) => void;
  setFoods: (id: string, foods: FoodItem[], which: "foods" | "restFoods") => void;
  setStatus: (
    date: string,
    itemId: string,
    status: MealStatus,
    extra?: { snoozeMinutes?: number; foods?: FoodItem[]; note?: string; snoozeUntil?: number },
  ) => void;
  ack: (date: string, itemId: string) => void;
  saveLog: (date: string, itemId: string, foods: FoodItem[], note: string) => void;
  addWeight: (entry: WeightEntry) => void;
  removeWeight: (id: string) => void;
  addSleep: (entry: SleepEntry) => void;
  removeSleep: (id: string) => void;
  shiftSleep: (minutes: number) => void;
  applySeed: (now: Date) => void;
  applyInbox: (events: InboxEvent[]) => void;
  finishOnboarding: () => void;
  exportState: () => { version: 1; exportedAt: string; state: PersistedShape };
  importState: (raw: unknown) => boolean;
  resetAll: (now: Date) => void;
}

interface PersistedShape {
  profile: Profile;
  items: ScheduleItem[];
  logs: LifeData["logs"];
  weights: WeightEntry[];
  sleeps: SleepEntry[];
  seeded: boolean;
  onboarded: boolean;
  appliedEventIds: string[];
}

function blankEntry(partial: Partial<LogEntry> = {}): LogEntry {
  return {
    status: "pending",
    note: "",
    snoozeUntil: null,
    ackedFor: null,
    updatedAt: Date.now(),
    ...partial,
  };
}

function withEntry(
  logs: LifeData["logs"],
  date: string,
  itemId: string,
  next: LogEntry,
): LifeData["logs"] {
  const day = logs[date] ?? { date, entries: {} };
  return {
    ...logs,
    [date]: { date, entries: { ...day.entries, [itemId]: next } },
  };
}

function syncClocks(profile: Profile, items: ScheduleItem[]): ScheduleItem[] {
  return items.map((item) => {
    if (item.id === "wake") return { ...item, time: profile.wakeTime };
    if (item.id === "sleep") return { ...item, time: profile.sleepTime };
    if (item.id === "gym") return { ...item, time: profile.gymTime };
    return item;
  });
}

function initial(): PersistedShape {
  return {
    profile: cloneProfile(),
    items: cloneItems(),
    logs: {},
    weights: [],
    sleeps: [],
    seeded: false,
    onboarded: false,
    appliedEventIds: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export const useLife = create<LifeState>()(
  persist(
    (set, get) => ({
      ...initial(),
      updateProfile: (patch) =>
        set((s) => {
          const profile = { ...s.profile, ...patch };
          if (patch.gymDays) profile.gymDays = [...patch.gymDays];
          return { profile, items: syncClocks(profile, s.items) };
        }),
      updateItem: (id, patch) =>
        set((s) => {
          const items = s.items.map((item) => (item.id === id ? { ...item, ...patch, days: patch.days ? [...patch.days] : item.days } : item));
          const profile = { ...s.profile };
          const edited = items.find((item) => item.id === id);
          if (edited && isValidTime(edited.time)) {
            if (id === "wake") profile.wakeTime = edited.time;
            if (id === "sleep") profile.sleepTime = edited.time;
            if (id === "gym") profile.gymTime = edited.time;
          }
          return { items, profile };
        }),
      addItem: () => {
        const id = `custom-${Date.now()}`;
        const item: ScheduleItem = {
          id,
          time: "12:00",
          title: "وعده جدید",
          description: "",
          kind: "snack",
          enabled: true,
          notifyMode: "normal",
          days: [0, 1, 2, 3, 4, 5, 6],
          foods: [],
          restFoods: [],
          restTitle: "",
          restDescription: "",
        };
        set((s) => ({ items: [...s.items, item] }));
        return id;
      },
      removeItem: (id) => set((s) => ({ items: s.items.filter((item) => item.id !== id) })),
      setFoods: (id, foods, which) =>
        set((s) => ({
          items: s.items.map((item) => (item.id === id ? { ...item, [which]: foods.map((f) => ({ ...f })) } : item)),
        })),
      setStatus: (date, itemId, status, extra) =>
        set((s) => {
          const item = s.items.find((it) => it.id === itemId);
          if (!item) return s;
          const [y, m, d] = date.split("-").map(Number);
          const day = new Date(y, (m || 1) - 1, d || 1);
          const prev = s.logs[date]?.entries[itemId] ?? blankEntry();
          const moment = alarmMoment(item, prev, day);
          const mins = extra?.snoozeMinutes ?? s.profile.snoozeMinutes;
          const next = blankEntry({
            ...prev,
            status,
            updatedAt: Date.now(),
            ackedFor: moment,
            note: extra?.note ?? prev.note,
            foods: extra?.foods ?? prev.foods,
            snoozeUntil:
              status === "snoozed" ? extra?.snoozeUntil ?? Date.now() + mins * 60_000 : status === "pending" ? prev.snoozeUntil : null,
          });
          if (status === "done" && !next.foods) {
            next.foods = resolvedItem(item, day, s.profile).displayFoods.map((f) => ({ ...f }));
          }
          return { logs: withEntry(s.logs, date, itemId, next) };
        }),
      ack: (date, itemId) =>
        set((s) => {
          const item = s.items.find((it) => it.id === itemId);
          if (!item) return s;
          const [y, m, d] = date.split("-").map(Number);
          const day = new Date(y, (m || 1) - 1, d || 1);
          const prev = s.logs[date]?.entries[itemId] ?? blankEntry();
          const moment = alarmMoment(item, prev, day);
          return { logs: withEntry(s.logs, date, itemId, { ...prev, ackedFor: moment, updatedAt: Date.now() }) };
        }),
      saveLog: (date, itemId, foods, note) =>
        set((s) => {
          const prev = s.logs[date]?.entries[itemId] ?? blankEntry();
          return {
            logs: withEntry(s.logs, date, itemId, {
              ...prev,
              foods: foods.map((f) => ({ ...f })),
              note,
              updatedAt: Date.now(),
            }),
          };
        }),
      addWeight: (entry) =>
        set((s) => ({
          weights: [...s.weights.filter((w) => w.date !== entry.date && w.id !== entry.id), entry].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        })),
      removeWeight: (id) => set((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),
      addSleep: (entry) =>
        set((s) => ({
          sleeps: [...s.sleeps.filter((sl) => sl.date !== entry.date && sl.id !== entry.id), entry].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        })),
      removeSleep: (id) => set((s) => ({ sleeps: s.sleeps.filter((sl) => sl.id !== id) })),
      shiftSleep: (minutes) =>
        set((s) => {
          const profile = {
            ...s.profile,
            sleepTime: shiftClock(s.profile.sleepTime, minutes),
            wakeTime: shiftClock(s.profile.wakeTime, minutes),
          };
          const items = s.items.map((item) => {
            if (item.id === "sleep") return { ...item, time: profile.sleepTime };
            if (item.id === "wake") return { ...item, time: profile.wakeTime };
            if (item.id === "winddown") return { ...item, time: shiftClock(item.time, minutes) };
            return item;
          });
          return { profile, items };
        }),
      applySeed: (now) => {
        if (get().seeded) return;
        const seed = buildSeed(now);
        set({
          profile: cloneProfile(),
          items: cloneItems(),
          logs: seed.logs,
          weights: seed.weights,
          sleeps: seed.sleeps,
          seeded: true,
        });
      },
      applyInbox: (events) =>
        set((s) => {
          const seen = new Set(s.appliedEventIds);
          let logs = s.logs;
          const applied = [...s.appliedEventIds];
          for (const ev of events) {
            if (!ev?.id || seen.has(ev.id)) continue;
            seen.add(ev.id);
            applied.push(ev.id);
            const prev = logs[ev.date]?.entries[ev.itemId] ?? blankEntry();
            const next = blankEntry({
              ...prev,
              updatedAt: ev.at || Date.now(),
              status: ev.type === "snooze" ? "snoozed" : ev.type === "missed" ? "missed" : "done",
              snoozeUntil: ev.type === "snooze" ? ev.snoozeUntil ?? prev.snoozeUntil : null,
              ackedFor: ev.moment ?? prev.ackedFor,
            });
            logs = withEntry(logs, ev.date, ev.itemId, next);
          }
          return { logs, appliedEventIds: applied.slice(-300) };
        }),
      finishOnboarding: () => set({ onboarded: true }),
      exportState: () => {
        const s = get();
        const state: PersistedShape = {
          profile: s.profile,
          items: s.items,
          logs: s.logs,
          weights: s.weights,
          sleeps: s.sleeps,
          seeded: s.seeded,
          onboarded: s.onboarded,
          appliedEventIds: s.appliedEventIds,
        };
        return { version: 1 as const, exportedAt: new Date().toISOString(), state };
      },
      importState: (raw) => {
        const root = asRecord(raw);
        const state = asRecord(root?.state) ?? root;
        if (!state) return false;
        const profile = asRecord(state.profile);
        if (!profile || !Array.isArray(state.items) || !Array.isArray(state.weights) || !Array.isArray(state.sleeps)) return false;
        const logs = asRecord(state.logs);
        if (!logs) return false;
        set({
          profile: { ...cloneProfile(), ...(profile as unknown as Profile), gymDays: Array.isArray(profile.gymDays) ? [...(profile.gymDays as number[])] : cloneProfile().gymDays },
          items: (state.items as ScheduleItem[]).map((item) => ({
            ...item,
            days: Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4, 5, 6],
            foods: Array.isArray(item.foods) ? item.foods : [],
            restFoods: Array.isArray(item.restFoods) ? item.restFoods : [],
          })),
          logs: logs as LifeData["logs"],
          weights: state.weights as WeightEntry[],
          sleeps: state.sleeps as SleepEntry[],
          seeded: true,
          onboarded: true,
          appliedEventIds: Array.isArray(state.appliedEventIds) ? (state.appliedEventIds as string[]) : [],
        });
        return true;
      },
      resetAll: (now) => {
        const seed = buildSeed(now);
        set({
          profile: cloneProfile(),
          items: cloneItems(),
          logs: seed.logs,
          weights: seed.weights,
          sleeps: seed.sleeps,
          seeded: true,
          onboarded: true,
          appliedEventIds: [],
        });
      },
    }),
    {
      name: "mt2r-life",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? memoryStorage : localStorage)),
      partialize: (s) => ({
        profile: s.profile,
        items: s.items,
        logs: s.logs,
        weights: s.weights,
        sleeps: s.sleeps,
        seeded: s.seeded,
        onboarded: s.onboarded,
        appliedEventIds: s.appliedEventIds,
      }),
    },
  ),
);
