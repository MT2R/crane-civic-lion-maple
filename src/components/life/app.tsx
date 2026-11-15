import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChartLine, LayoutDashboard, Moon, Scale, Settings, SlidersHorizontal, UtensilsCrossed } from "lucide-react";
import { installAudioUnlock, playSound, stopSound, vibrateFor } from "@/lib/life/audio";
import { faClock } from "@/lib/life/format";
import {
  alarmMoment,
  buildEvents,
  buildHomeModel,
  dateKey,
  findRinging,
  getEntry,
  parseDateKey,
  resolvedItem,
  type RingHit,
} from "@/lib/life/logic";
import { drainInbox, requestNotificationPermission, swPost, syncEvents, type SwStatus } from "@/lib/life/notifications";
import { useLife } from "@/lib/life/store";
import type { FoodItem, MealStatus, RangeKey, ViewId } from "@/lib/life/types";
import { AlarmOverlay } from "./alarm";
import { Dashboard } from "./dashboard";
import { PlanView } from "./plan";
import { ReportsView } from "./reports";
import { SettingsView } from "./settings";
import { SleepView } from "./sleep";
import { Field, FoodEditor, Modal, Segmented, TextArea } from "./ui";
import { WeightView } from "./weight";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "home", label: "خانه", icon: LayoutDashboard },
  { id: "plan", label: "برنامه", icon: UtensilsCrossed },
  { id: "weight", label: "وزن", icon: Scale },
  { id: "sleep", label: "خواب", icon: Moon },
  { id: "reports", label: "گزارش", icon: ChartLine },
];

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "day", label: "روز" },
  { value: "week", label: "هفته" },
  { value: "month", label: "ماه" },
];

const TITLES: Record<ViewId, string> = {
  home: "امروز",
  plan: "برنامه",
  weight: "وزن",
  sleep: "خواب",
  reports: "گزارش",
  settings: "تنظیمات",
};

export function App() {
  const profile = useLife((s) => s.profile);
  const items = useLife((s) => s.items);
  const logs = useLife((s) => s.logs);
  const weights = useLife((s) => s.weights);
  const sleeps = useLife((s) => s.sleeps);
  const seeded = useLife((s) => s.seeded);
  const onboarded = useLife((s) => s.onboarded);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [view, setView] = useState<ViewId>("home");
  const [range, setRange] = useState<RangeKey>("day");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sw, setSw] = useState<SwStatus | null>(null);
  const [trigger, setTrigger] = useState<boolean | null>(null);
  const [ring, setRing] = useState<RingHit | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const silenced = useRef(new Set<string>());

  useEffect(() => {
    let cancel = false;
    installAudioUnlock();
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    void (async () => {
      try {
        await Promise.race([
          useLife.persist.rehydrate(),
          new Promise((resolve) => window.setTimeout(resolve, 400)),
        ]);
      } catch {
        /* keep defaults */
      }
      if (cancel) return;
      if (!useLife.getState().seeded) useLife.getState().applySeed(new Date());
      document.documentElement.dataset.theme = useLife.getState().profile.theme;
      setReady(true);
    })();
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = profile.theme;
  }, [ready, profile.theme]);

  const minute = now ? Math.floor(now.getTime() / 60_000) : 0;
  const stamp = useMemo(() => (minute ? new Date(minute * 60_000) : null), [minute]);

  const model = useMemo(() => {
    if (!stamp || !seeded) return null;
    return buildHomeModel({ profile, items, logs, weights, sleeps }, stamp, range);
  }, [stamp, seeded, range, profile, items, logs, weights, sleeps]);

  useEffect(() => {
    if (!ready || !seeded) return;
    const events = buildEvents(useLife.getState(), new Date(), trigger ? 7 : 2);
    let cancel = false;
    void syncEvents(events).then((status) => {
      if (cancel) return;
      setSw(status);
      if (status.trigger) setTrigger(true);
      else if (trigger === null) setTrigger(false);
    });
    return () => {
      cancel = true;
    };
  }, [ready, seeded, items, logs, profile, minute, trigger]);

  useEffect(() => {
    if (!ready) return;
    const beat = () => {
      if (document.visibilityState === "visible") swPost({ type: "FOREGROUND", ms: 8000 });
    };
    beat();
    const id = window.setInterval(beat, 4000);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopSound();
        swPost({ type: "FOREGROUND", ms: 0 });
        swPost({ type: "CHECK" });
      } else beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const pull = () => {
      void drainInbox().then((events) => {
        if (events.length) useLife.getState().applyInbox(events);
      });
    };
    pull();
    const id = window.setInterval(pull, 5000);
    const onSw = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: { itemId?: string; date?: string; moment?: number; when?: number; tag?: string } };
      if (data?.type === "INBOX") pull();
      if (data?.type === "ALARM" && data.payload?.itemId) {
        const hit = ringFrom(data.payload.itemId, data.payload.date, data.payload.moment || data.payload.when, data.payload.tag);
        if (hit && !silenced.current.has(hit.tag)) setRing((prev) => (prev?.tag === hit.tag ? prev : hit));
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSw);
    const q = new URLSearchParams(window.location.search);
    const alarm = q.get("alarm");
    if (alarm) {
      const hit = ringFrom(alarm, q.get("date") ?? undefined, undefined, undefined);
      if (hit) setRing(hit);
    }
    return () => {
      window.clearInterval(id);
      navigator.serviceWorker?.removeEventListener("message", onSw);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const hit = findRinging(useLife.getState(), new Date());
      setRing((prev) => {
        if (!hit || silenced.current.has(hit.tag)) {
          if (!prev) return null;
          if (!hit || prev.tag === hit.tag || silenced.current.has(prev.tag)) return null;
          return prev;
        }
        return prev?.tag === hit.tag ? prev : hit;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ring || document.visibilityState !== "visible") return;
    playSound(profile.sound, ring.mode);
    vibrateFor(ring.mode);
    swPost({ type: "SUPPRESS", tag: ring.tag, ms: 8000 });
    const id = window.setInterval(() => swPost({ type: "SUPPRESS", tag: ring.tag, ms: 8000 }), 4000);
    return () => {
      window.clearInterval(id);
      stopSound();
    };
  }, [ring, profile.sound]);

  function act(kind: "done" | "missed" | "snooze" | "stop", mins?: 5 | 10 | 15) {
    if (!ring) return;
    silenced.current.add(ring.tag);
    swPost({ type: "ACK", tag: ring.tag });
    stopSound();
    const api = useLife.getState();
    if (kind === "stop") api.ack(ring.date, ring.item.id);
    else if (kind === "snooze") api.setStatus(ring.date, ring.item.id, "snoozed", { snoozeMinutes: mins ?? profile.snoozeMinutes });
    else api.setStatus(ring.date, ring.item.id, kind === "done" ? "done" : "missed");
    setRing(null);
  }

  const todayKey = now ? dateKey(now) : "";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-6">
        <div className="rounded-xl border border-line bg-shell">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">
                MT2R <span aria-hidden>›</span> {TITLES[view]}
              </p>
              {profile.displayName ? <p className="truncate text-sm">{profile.displayName}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view === "home" ? <Segmented value={range} options={RANGES} onChange={setRange} label="بازه نمودار" /> : null}
              {view === "home" ? (
                <div className="relative">
                  <button
                    type="button"
                    aria-label="فیلتر فهرست"
                    aria-expanded={filterOpen}
                    className="flex size-11 items-center justify-center rounded-lg border border-line text-muted"
                    onClick={() => setFilterOpen((v) => !v)}
                  >
                    <SlidersHorizontal className="size-4" />
                  </button>
                  {filterOpen ? (
                    <div className="absolute end-0 z-20 mt-1 w-44 rounded-lg border border-line bg-card p-2 text-sm">
                      <button
                        type="button"
                        className="h-11 w-full rounded-md text-start"
                        onClick={() => {
                          setOnlyOpen((v) => !v);
                          setFilterOpen(false);
                        }}
                      >
                        {onlyOpen ? "نمایش همه وعده‌ها" : "فقط انجام‌نشده‌ها"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                aria-label="تنظیمات"
                className="flex size-11 items-center justify-center rounded-lg border border-line text-muted"
                onClick={() => setView("settings")}
              >
                <Settings className="size-4" />
              </button>
              <p className="tabular text-xs text-muted">{now ? faClock(now, true) : "—:—:—"}</p>
            </div>
          </header>
          <main className="p-3 pb-24">
            {ready && !onboarded ? <SetupCard onDone={() => useLife.getState().finishOnboarding()} /> : null}
            {view === "home" ? (
              <Dashboard
                model={model}
                now={now}
                items={items}
                onlyOpen={onlyOpen}
                onOpen={(id) => setLogId(id)}
                onStatus={(id, status) => {
                  if (!todayKey) return;
                  useLife.getState().setStatus(todayKey, id, status);
                }}
              />
            ) : null}
            {view === "plan" ? <PlanView /> : null}
            {view === "weight" ? <WeightView now={now} /> : null}
            {view === "sleep" ? <SleepView now={now} /> : null}
            {view === "reports" ? <ReportsView now={now} /> : null}
            {view === "settings" ? <SettingsView now={now} sw={sw} /> : null}
          </main>
        </div>
      </div>
      <nav className="dock" aria-label="بخش‌ها">
        <div className="mx-auto flex max-w-5xl">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-accent" : "text-muted"}`}
                onClick={() => setView(item.id)}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
      {ring ? (
        <AlarmOverlay
          ring={ring}
          onDone={() => act("done")}
          onMiss={() => act("missed")}
          onSnooze={(mins) => act("snooze", mins)}
          onStop={() => act("stop")}
        />
      ) : null}
      {logId && todayKey ? <LogDialog itemId={logId} date={todayKey} onClose={() => setLogId(null)} /> : null}
    </div>
  );
}

function ringFrom(itemId: string, date: string | undefined, moment: number | undefined, tag: string | undefined): RingHit | null {
  const state = useLife.getState();
  const item = state.items.find((row) => row.id === itemId);
  if (!item) return null;
  const key = date || dateKey(new Date());
  const day = parseDateKey(key);
  const entry = getEntry(state, key, item.id);
  const when = moment || alarmMoment(item, entry, day);
  return {
    tag: tag || `mt2r-sched-${item.id}-${key}-${when}`,
    item,
    resolved: resolvedItem(item, day, state.profile),
    date: key,
    moment: when,
    mode: item.notifyMode,
  };
}

function SetupCard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  return (
    <section className="mb-3 rounded-lg border border-line bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Bell className="size-4 text-accent" />
        راه‌اندازی دستیار
      </div>
      {step === 0 ? (
        <p className="text-sm text-muted">
          MT2R ساعت خواب، وعده‌ها و باشگاه را یادآوری می‌کند. همه‌چیز روی همین دستگاه می‌ماند و برای کار روزمره اینترنت لازم نیست.
        </p>
      ) : null}
      {step === 1 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">برای یادآوری وقتی صفحه بسته است، اجازه اعلان لازم است. آلارم داخل اپ حتی بدون این اجازه، وقتی برنامه باز باشد زنگ می‌زند.</p>
          <button
            type="button"
            className="h-11 rounded-lg bg-accent px-3 text-sm text-accent-ink"
            onClick={() =>
              void requestNotificationPermission().then((value) => {
                setNote(value === "granted" ? "اجازه داده شد." : value === "denied" ? "رد شد؛ بعداً از تنظیمات مرورگر می‌توانی عوضش کنی." : "این محیط اجازه اعلان نمی‌دهد.");
                setStep(2);
              })
            }
          >
            درخواست اجازه اعلان
          </button>
          {note ? <p className="text-xs text-muted">{note}</p> : null}
        </div>
      ) : null}
      {step === 2 ? (
        <p className="text-sm text-muted">
          آلارم تمام‌صفحه با صدای ممتد، وقتی اپ کشته شده، روی iOS و اغلب مرورگرها ممکن نیست. جایی که سیستم اجازه بدهد اعلان محلی سر ساعت ثبت می‌شود؛ وگرنه با باز شدن اپ، یادآوری ۲۰ دقیقه اخیر نشان داده می‌شود. جزئیات در تنظیمات است.
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        {step < 2 ? (
          <button type="button" className="h-11 flex-1 rounded-lg bg-accent text-sm text-accent-ink" onClick={() => setStep((s) => Math.min(2, s + 1))}>
            بعدی
          </button>
        ) : (
          <button type="button" className="h-11 flex-1 rounded-lg bg-accent text-sm text-accent-ink" onClick={onDone}>
            شروع
          </button>
        )}
        <button type="button" className="h-11 rounded-lg border border-line px-3 text-sm text-muted" onClick={onDone}>
          رد کردن
        </button>
      </div>
    </section>
  );
}

function LogDialog({ itemId, date, onClose }: { itemId: string; date: string; onClose: () => void }) {
  const item = useLife((s) => s.items.find((row) => row.id === itemId));
  const profile = useLife((s) => s.profile);
  const entry = useLife((s) => s.logs[date]?.entries[itemId]);
  const resolved = item ? resolvedItem(item, parseDateKey(date), profile) : null;
  const [foods, setFoods] = useState<FoodItem[]>(entry?.foods ?? resolved?.displayFoods ?? []);
  const [note, setNote] = useState(entry?.note ?? "");
  useEffect(() => {
    setFoods(entry?.foods ?? resolved?.displayFoods ?? []);
    setNote(entry?.note ?? "");
  }, [itemId, date]);
  if (!item || !resolved) return null;
  const save = (status?: MealStatus) => {
    const clean = foods.filter((food) => food.name.trim());
    const api = useLife.getState();
    if (status) api.setStatus(date, itemId, status, { foods: clean, note });
    else api.saveLog(date, itemId, clean, note);
    onClose();
  };
  return (
    <Modal title={resolved.displayTitle} onClose={onClose}>
      <p className="mb-2 text-xs text-muted">
        {KIND_LABEL[item.kind]} · {item.time} · اعداد تخمینی‌اند
      </p>
      <p className="mb-3 text-sm text-muted">{resolved.displayDescription}</p>
      <FoodEditor foods={foods} onChange={setFoods} />
      <div className="mt-3">
        <Field label="یادداشت این وعده">
          <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="h-11 rounded-lg bg-good text-sm text-good-ink" onClick={() => save("done")}>
          انجام شد
        </button>
        <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => save("missed")}>
          انجام نشد
        </button>
        <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => save("snoozed")}>
          تعویق
        </button>
        <button type="button" className="h-11 rounded-lg bg-accent text-sm text-accent-ink" onClick={() => save()}>
          ذخیره مقدارها
        </button>
      </div>
    </Modal>
  );
}
