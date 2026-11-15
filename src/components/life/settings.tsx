import { useEffect, useState } from "react";
import { SOUND_LABEL, WEEK_OPTIONS, faTime } from "@/lib/life/format";
import { buildEvents, dateKey } from "@/lib/life/logic";
import { pingSw, requestNotificationPermission, runSelfTest, type SelfTestResult, type SwStatus } from "@/lib/life/notifications";
import { playSound, primeAudio } from "@/lib/life/audio";
import { useLife } from "@/lib/life/store";
import type { SoundId } from "@/lib/life/types";
import { Field, TextInput } from "./ui";

export function SettingsView({ now, sw }: { now: Date | null; sw: SwStatus | null }) {
  const profile = useLife((s) => s.profile);
  const updateProfile = useLife((s) => s.updateProfile);
  const items = useLife((s) => s.items);
  const logs = useLife((s) => s.logs);
  const [perm, setPerm] = useState<string>(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [live, setLive] = useState<SwStatus | null>(sw);
  const [test, setTest] = useState<SelfTestResult | null>(null);
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event & { prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    void pingSw().then(setLive);
  }, [sw]);

  const data = useLife.getState();

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-lg border border-line bg-card p-3">
        <h2 className="text-sm font-medium">مشخصات</h2>
        <Field label="نام">
          <TextInput value={profile.displayName} placeholder="نام تو" onChange={(event) => updateProfile({ displayName: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="قد (سانتی‌متر)">
            <TextInput
              dir="ltr"
              inputMode="numeric"
              value={String(profile.heightCm)}
              onChange={(event) => updateProfile({ heightCm: clamp(Number(event.target.value), 120, 230, profile.heightCm) })}
            />
          </Field>
          <Field label="رسیدن به کار">
            <TextInput dir="ltr" type="time" value={profile.workArrival} onChange={(event) => updateProfile({ workArrival: event.target.value })} />
          </Field>
          <Field label="وزن شروع">
            <TextInput
              dir="ltr"
              inputMode="decimal"
              value={String(profile.startWeightKg)}
              onChange={(event) => updateProfile({ startWeightKg: clamp(Number(event.target.value), 30, 200, profile.startWeightKg) })}
            />
          </Field>
          <Field label="وزن هدف">
            <TextInput
              dir="ltr"
              inputMode="decimal"
              value={String(profile.goalWeightKg)}
              onChange={(event) => updateProfile({ goalWeightKg: clamp(Number(event.target.value), 30, 200, profile.goalWeightKg) })}
            />
          </Field>
          <Field label="خواب">
            <TextInput dir="ltr" type="time" value={profile.sleepTime} onChange={(event) => updateProfile({ sleepTime: event.target.value })} />
          </Field>
          <Field label="بیداری">
            <TextInput dir="ltr" type="time" value={profile.wakeTime} onChange={(event) => updateProfile({ wakeTime: event.target.value })} />
          </Field>
          <Field label="ساعت باشگاه">
            <TextInput dir="ltr" type="time" value={profile.gymTime} onChange={(event) => updateProfile({ gymTime: event.target.value })} />
          </Field>
          <Field label="هدف خواب (ساعت)">
            <TextInput
              dir="ltr"
              inputMode="decimal"
              value={String(profile.sleepTargetHours)}
              onChange={(event) => updateProfile({ sleepTargetHours: clamp(Number(event.target.value), 4, 12, profile.sleepTargetHours) })}
            />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">روزهای باشگاه. پیش‌فرض چهار روز: شنبه، یکشنبه، سه‌شنبه و پنجشنبه.</p>
          <div className="flex flex-wrap gap-1">
            {WEEK_OPTIONS.map((day) => {
              const on = profile.gymDays.includes(day.d);
              return (
                <button
                  key={day.d}
                  type="button"
                  aria-pressed={on}
                  className={`h-11 rounded-lg px-3 text-sm ${on ? "bg-accent text-accent-ink" : "border border-line text-muted"}`}
                  onClick={() =>
                    updateProfile({
                      gymDays: on ? profile.gymDays.filter((d) => d !== day.d) : [...profile.gymDays, day.d],
                    })
                  }
                >
                  {day.full}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-card p-3">
        <h2 className="text-sm font-medium">اعلان و آلارم</h2>
        <p className="text-xs text-muted">وضعیت اجازه: {labelPerm(perm)} · سرویس‌ورکر: {live?.ok ? "روشن" : live?.error || "نامشخص"}</p>
        <p className="text-xs text-muted">
          زمان‌بندی دقیق سیستم: {live?.trigger ? "پشتیبانی می‌شود" : "در این مرورگر نیست"} · آلارم‌های آینده: {live ? String(live.count) : "—"} · شامل فردا:{" "}
          {live ? String(live.tomorrow) : "—"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-11 rounded-lg bg-accent text-sm text-accent-ink"
            onClick={() => void requestNotificationPermission().then(setPerm)}
          >
            اجازه اعلان
          </button>
          <button
            type="button"
            className="h-11 rounded-lg border border-line text-sm"
            onClick={() => {
              primeAudio();
              playSound(profile.sound, "alarm");
              window.setTimeout(() => {
                void import("@/lib/life/audio").then((m) => m.stopSound());
              }, 2200);
            }}
          >
            پیش‌شنیدن صدا
          </button>
        </div>
        <Field label="صدای داخل اپ">
          <select
            className="h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
            value={profile.sound}
            onChange={(event) => updateProfile({ sound: event.target.value as SoundId })}
          >
            {(Object.keys(SOUND_LABEL) as SoundId[]).map((id) => (
              <option key={id} value={id}>
                {SOUND_LABEL[id]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تعویق پیش‌فرض">
          <select
            className="h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
            value={String(profile.snoozeMinutes)}
            onChange={(event) => updateProfile({ snoozeMinutes: Number(event.target.value) as 5 | 10 | 15 })}
          >
            <option value="5">۵ دقیقه</option>
            <option value="10">۱۰ دقیقه</option>
            <option value="15">۱۵ دقیقه</option>
          </select>
        </Field>
        <Field label="مهلت قبل از «نشد» (دقیقه)">
          <TextInput
            dir="ltr"
            inputMode="numeric"
            value={String(profile.graceMinutes)}
            onChange={(event) => updateProfile({ graceMinutes: clamp(Number(event.target.value), 5, 180, profile.graceMinutes) })}
          />
        </Field>
        <button
          type="button"
          className="h-11 w-full rounded-lg border border-line text-sm"
          onClick={() => {
            if (!now) return;
            const events = buildEvents({ profile, items, logs, weights: data.weights, sleeps: data.sleeps }, now, live?.trigger ? 7 : 2);
            void runSelfTest(events).then(setTest);
          }}
        >
          خودآزمایی زمان‌بندی و اعلان ۸ ثانیه‌ای
        </button>
        {test ? (
          <div className="rounded-lg bg-bg p-2 text-xs text-muted">
            <p>سرویس‌ورکر: {test.sw ? "بله" : "نه"}</p>
            <p>TimestampTrigger: {test.trigger ? "بله" : "خیر"}</p>
            <p>تعداد آلارم ذخیره‌شده: {test.eventCount} · برای روزهای بعد: {test.tomorrow}</p>
            <p>زمان‌بندی مجدد بعد از شبیه‌سازی ری‌استارت ورکر: {test.rescheduleMatch ? "همان فهرست برگشت" : "ناهماهنگ یا خالی"}</p>
            <p>اعلان آزمایشی: {test.testScheduled ? "برای حدود ۸ ثانیه دیگر ثبت شد" : "ثبت نشد"}</p>
            {test.error ? <p>{test.error}</p> : null}
          </div>
        ) : null}
        <details className="text-xs text-muted">
          <summary className="cursor-pointer text-sm text-fg">محدودیت واقعی آلارم</summary>
          <div className="mt-2 space-y-2">
            <p>
              این نسخه یک وب‌اپ قابل نصب است، نه باینری نیتیو. AlarmManager اندروید و UserNotifications آی‌او‌اس از داخل صفحه وب در دسترس نیستند.
            </p>
            <p>
              اگر مرورگر TimestampTrigger داشته باشد (بعضی نسخه‌های کروم اندروید)، اعلان در ساعت دقیق حتی با بسته‌بودن صفحه زمان‌بندی می‌شود و بعد از ری‌استارت مرورگر معمولاً می‌ماند. در غیر این صورت تایمر سرویس‌ورکر فقط تا وقتی خود ورکر زنده است دقیق است.
            </p>
            <p>
              صدای ممتد تمام‌صفحه وقتی اپ کاملاً بسته است روی iOS عملاً ممکن نیست. جایگزین: لرزش و اعلان سیستم، تکرار اعلان آلارم تا تأیید، و صفحهٔ آلارم داخل اپ به‌محض باز شدن اگر کمتر از ۲۰ دقیقه از موعد گذشته باشد.
            </p>
            <p>
              صدای خود اعلان سیستم را مرورگر انتخاب می‌کند؛ انتخاب صدا فقط برای زنگ داخل اپ است. کارها از دکمه‌های خود اعلان (انجام شد / تعویق) در صف ذخیره می‌شوند و با باز شدن اپ اعمال می‌شوند.
            </p>
            <p>تکرار روزانه و روزهای هفته در داده ذخیره است. افق ثبت: ۴۸ ساعت، و اگر تریگر سیستم باشد تا ۷ روز. با هر بار باز شدن اپ از نو ثبت می‌شود تا تکرار قطع نشود.</p>
          </div>
        </details>
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-card p-3">
        <h2 className="text-sm font-medium">ظاهر و نصب</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`h-11 rounded-lg text-sm ${profile.theme === "dark" ? "bg-accent text-accent-ink" : "border border-line"}`}
            onClick={() => updateProfile({ theme: "dark" })}
          >
            تیره
          </button>
          <button
            type="button"
            className={`h-11 rounded-lg text-sm ${profile.theme === "light" ? "bg-accent text-accent-ink" : "border border-line"}`}
            onClick={() => updateProfile({ theme: "light" })}
          >
            روشن
          </button>
        </div>
        {installEvent ? (
          <button type="button" className="h-11 w-full rounded-lg border border-line text-sm" onClick={() => void installEvent.prompt()}>
            نصب روی صفحه اصلی
          </button>
        ) : (
          <p className="text-xs text-muted">
            برای نصب: در کروم اندروید «افزودن به صفحه اصلی»، در آیفون سهم‌گذاری و بعد Add to Home Screen. آدرس {faTime("08:30")} نمونهٔ کار در مشخصات قابل تغییر است.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-card p-3">
        <h2 className="text-sm font-medium">پشتیبان</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-11 rounded-lg border border-line text-sm"
            onClick={() => {
              const payload = useLife.getState().exportState();
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = `mt2r-backup-${now ? dateKey(now) : "data"}.json`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}
          >
            دانلود پشتیبان
          </button>
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line text-sm">
            بازیابی
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const ok = useLife.getState().importState(JSON.parse(String(reader.result)));
                    setMsg(ok ? "بازیابی شد." : "فایل معتبر نیست.");
                  } catch {
                    setMsg("فایل خوانده نشد.");
                  }
                };
                reader.readAsText(file);
              }}
            />
          </label>
        </div>
        {msg ? <p className="text-xs text-muted">{msg}</p> : null}
        {confirmReset ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-11 rounded-lg bg-bad text-sm text-bad-ink"
              onClick={() => {
                useLife.getState().resetAll(new Date());
                setConfirmReset(false);
                setMsg("داده‌ها به برنامهٔ پیش‌فرض برگشت.");
              }}
            >
              بله، پاک شود
            </button>
            <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => setConfirmReset(false)}>
              انصراف
            </button>
          </div>
        ) : (
          <button type="button" className="h-11 w-full rounded-lg border border-line text-sm text-bad" onClick={() => setConfirmReset(true)}>
            پاک کردن اطلاعات
          </button>
        )}
      </section>
    </div>
  );
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function labelPerm(value: string): string {
  if (value === "granted") return "داده شده";
  if (value === "denied") return "رد شده";
  if (value === "unsupported") return "پشتیبانی نمی‌شود";
  return "هنوز پرسیده نشده";
}
