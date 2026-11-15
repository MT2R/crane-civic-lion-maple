import { useEffect, useState } from "react";
import { faFixed, faInt, faSigned } from "@/lib/life/format";
import { bmi, dateKey, latestWeight, weightAtOrBefore, weightPlateau } from "@/lib/life/logic";
import { useLife } from "@/lib/life/store";
import { Field, TextArea, TextInput, TrendChart } from "./ui";

export function WeightView({ now }: { now: Date | null }) {
  const weights = useLife((s) => s.weights);
  const profile = useLife((s) => s.profile);
  const addWeight = useLife((s) => s.addWeight);
  const removeWeight = useLife((s) => s.removeWeight);
  const [date, setDate] = useState("");
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (now && !date) setDate(dateKey(now));
  }, [now, date]);

  const latest = latestWeight(weights);
  const start = weightAtOrBefore(weights, weights[0]?.date ?? "") ?? profile.startWeightKg;
  const gain = latest ? latest.kg - profile.startWeightKg : 0;
  const span = Math.max(1, profile.goalWeightKg - profile.startWeightKg);
  const progress = latest ? Math.max(0, Math.min(1, (latest.kg - profile.startWeightKg) / span)) : 0;
  const plateau = weightPlateau(weights);
  const points = [...weights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ label: row.date.slice(5), current: row.kg, previous: profile.goalWeightKg }));

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-line bg-card p-3">
        <p className="text-xs text-muted">آخرین وزن</p>
        <p className="tabular mt-1 text-3xl font-semibold">{latest ? faFixed(latest.kg) : "—"}</p>
        <p className="mt-1 text-xs text-muted">
          هدف {faFixed(profile.goalWeightKg, 0)} کیلو · شروع {faFixed(profile.startWeightKg, 0)} · تغییر {faSigned(gain, 1)} کیلو
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-track">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {latest ? `BMI تقریبی ${faFixed(bmi(latest.kg, profile.heightCm))} — فقط برای دیدن روند، نه تشخیص.` : "هنوز وزنی ثبت نشده."}
        </p>
        {plateau ? (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            سه هفتهٔ اخیر تقریباً بدون تغییر مانده. سهم غذا را کمی بالا ببر و یک هفته دوباره وزن را ثبت کن.
          </p>
        ) : null}
      </section>
      <section className="rounded-lg border border-line bg-card p-3">
        <h2 className="mb-2 text-sm font-medium">روند وزن</h2>
        <p className="mb-2 text-xs text-muted">خط پر: وزن تو · خط‌چین: وزن هدف</p>
        {points.length > 1 ? (
          <TrendChart points={points} digits={1} currentLabel="وزن" previousLabel="هدف" />
        ) : (
          <p className="text-sm text-muted">حداقل دو ثبت لازم است.</p>
        )}
      </section>
      <form
        className="space-y-2 rounded-lg border border-line bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(kg);
          if (!date || !Number.isFinite(value) || value < 25 || value > 250) return;
          addWeight({ id: `w-${date}`, date, kg: Math.round(value * 10) / 10, note: note.trim() });
          setKg("");
          setNote("");
        }}
      >
        <h2 className="text-sm font-medium">ثبت وزن</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="تاریخ">
            <TextInput dir="ltr" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </Field>
          <Field label="کیلوگرم">
            <TextInput dir="ltr" inputMode="decimal" value={kg} onChange={(event) => setKg(event.target.value)} placeholder="53.4" required />
          </Field>
        </div>
        <Field label="توضیح">
          <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثلاً قبل از صبحانه" />
        </Field>
        <button type="submit" className="h-11 w-full rounded-lg bg-accent text-sm text-accent-ink">
          ذخیره وزن
        </button>
      </form>
      <ul className="space-y-2">
        {[...weights].reverse().map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <div>
              <p className="tabular text-sm">{faFixed(row.kg)} کیلو</p>
              <p className="text-xs text-muted">
                {row.date}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </div>
            <button type="button" className="h-11 px-2 text-sm text-bad" onClick={() => removeWeight(row.id)}>
              حذف
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">شروع محاسبه‌شده از اولین نقطه: {faInt(start)} — معیار اصلی، وزن شروع در تنظیمات است.</p>
    </div>
  );
}
