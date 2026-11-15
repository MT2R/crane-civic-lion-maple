import { useEffect, useState } from "react";
import { faDurationHours, faFixed, faTime } from "@/lib/life/format";
import { avg, dateKey, sleepHours, sleepsIn } from "@/lib/life/logic";
import { useLife } from "@/lib/life/store";
import { Field, TextArea, TextInput } from "./ui";

export function SleepView({ now }: { now: Date | null }) {
  const sleeps = useLife((s) => s.sleeps);
  const profile = useLife((s) => s.profile);
  const addSleep = useLife((s) => s.addSleep);
  const removeSleep = useLife((s) => s.removeSleep);
  const shiftSleep = useLife((s) => s.shiftSleep);
  const [date, setDate] = useState("");
  const [bed, setBed] = useState(profile.sleepTime);
  const [wake, setWake] = useState(profile.wakeTime);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (now && !date) setDate(dateKey(now));
  }, [now, date]);

  const weekAvg = now ? avg(sleepsIn({ profile, items: [], logs: {}, weights: [], sleeps }, new Date(now.getTime() - 6 * 86400000), now)) : null;
  const last = [...sleeps].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-line bg-card p-3">
        <p className="text-xs text-muted">میانگین ۷ روز</p>
        <p className="mt-1 text-3xl font-semibold">{faDurationHours(weekAvg)}</p>
        <p className="mt-1 text-xs text-muted">
          هدف {faFixed(profile.sleepTargetHours, 0)} ساعت · خواب {faTime(profile.sleepTime)} تا بیداری {faTime(profile.wakeTime)}
        </p>
        {last ? <p className="mt-2 text-xs text-muted">آخرین ثبت: {faDurationHours(sleepHours(last.bed, last.wake))}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => shiftSleep(-15)}>
            ۱۵ دقیقه زودتر
          </button>
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => shiftSleep(15)}>
            ۱۵ دقیقه دیرتر
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">جابه‌جایی، ساعت خواب، بیداری و آماده‌سازی خواب را با هم حرکت می‌دهد.</p>
      </section>
      <form
        className="space-y-2 rounded-lg border border-line bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!date || !bed || !wake) return;
          const wakeDate = new Date(`${date}T${wake}:00`);
          const bedDate = new Date(`${date}T${bed}:00`);
          if (bedDate.getTime() >= wakeDate.getTime()) bedDate.setDate(bedDate.getDate() - 1);
          addSleep({
            id: `s-${date}`,
            date,
            bed: bedDate.toISOString(),
            wake: wakeDate.toISOString(),
            note: note.trim(),
          });
          setNote("");
        }}
      >
        <h2 className="text-sm font-medium">ثبت خواب</h2>
        <Field label="تاریخ بیداری">
          <TextInput dir="ltr" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ساعت خواب">
            <TextInput dir="ltr" type="time" value={bed} onChange={(event) => setBed(event.target.value)} required />
          </Field>
          <Field label="ساعت بیداری">
            <TextInput dir="ltr" type="time" value={wake} onChange={(event) => setWake(event.target.value)} required />
          </Field>
        </div>
        <Field label="توضیح">
          <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <button type="submit" className="h-11 w-full rounded-lg bg-accent text-sm text-accent-ink">
          ذخیره خواب
        </button>
      </form>
      <ul className="space-y-2">
        {[...sleeps].reverse().map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <div>
              <p className="text-sm">{faDurationHours(sleepHours(row.bed, row.wake))}</p>
              <p className="text-xs text-muted">
                بیداری {row.date}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </div>
            <button type="button" className="h-11 px-2 text-sm text-bad" onClick={() => removeSleep(row.id)}>
              حذف
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
