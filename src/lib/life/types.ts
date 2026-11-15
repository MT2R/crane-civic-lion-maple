export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type ItemKind =
  | "wake"
  | "breakfast"
  | "snack"
  | "lunch"
  | "preworkout"
  | "gym"
  | "dinner"
  | "nightsnack"
  | "winddown"
  | "sleep";

export type NotifyMode = "normal" | "loud" | "alarm";
export type MealStatus = "pending" | "done" | "missed" | "snoozed";
export type SoundId = "chime" | "bell" | "soft" | "alarm";
export type RangeKey = "day" | "week" | "month";
export type ThemeMode = "dark" | "light";
export type ViewId = "home" | "plan" | "weight" | "sleep" | "reports" | "settings";

export interface FoodItem {
  id: string;
  name: string;
  amount: string;
  kcal: number;
  protein: number;
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
  kind: ItemKind;
  enabled: boolean;
  notifyMode: NotifyMode;
  days: number[];
  foods: FoodItem[];
  restFoods: FoodItem[];
  restTitle: string;
  restDescription: string;
}

export interface LogEntry {
  status: MealStatus;
  foods?: FoodItem[];
  note: string;
  snoozeUntil?: number | null;
  ackedFor?: number | null;
  updatedAt: number;
}

export interface DayLog {
  date: string;
  entries: Record<string, LogEntry>;
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
  note: string;
}

export interface SleepEntry {
  id: string;
  date: string;
  bed: string;
  wake: string;
  note: string;
}

export interface Profile {
  displayName: string;
  heightCm: number;
  startWeightKg: number;
  goalWeightKg: number;
  workArrival: string;
  gymTime: string;
  gymDays: number[];
  sleepTargetHours: number;
  sleepTime: string;
  wakeTime: string;
  snoozeMinutes: 5 | 10 | 15;
  theme: ThemeMode;
  sound: SoundId;
  graceMinutes: number;
}

export interface LifeData {
  profile: Profile;
  items: ScheduleItem[];
  logs: Record<string, DayLog>;
  weights: WeightEntry[];
  sleeps: SleepEntry[];
}

export interface SwEvent {
  tag: string;
  when: number;
  title: string;
  body: string;
  mode: NotifyMode;
  itemId: string;
  date: string;
  snoozeMinutes: number;
  sound: SoundId;
}

export interface InboxEvent {
  id: string;
  type: "done" | "missed" | "snooze";
  itemId: string;
  date: string;
  moment?: number;
  snoozeUntil?: number;
  at: number;
}
