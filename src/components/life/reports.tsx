import { useState } from "react";
import { faDurationHours, faFixed, faInt, faSigned } from "@/lib/life/format";
import { buildReport } from "@/lib/life/logic";
import { useLife } from "@/lib/life/store";
import type { RangeKey } from "@/lib/life/types";
import { Segmented, TrendChart } from "./ui";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "day", label: "روز" },
  { value: "week", label: "هفته" },
  { value: "month", label: "ماه" },
];

export function ReportsView({ now }: { now: Date | null }) {
  const [range, setRange] = useState<RangeKey>("week");
  const data = useLife((s) => ({ profile: s.profile, items: s.items, logs: s.logs, weights: s.weights, sleeps: s.sleeps }));
  const model = now ? buildReport(data, now, range) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">گزارش</h2>
        <Segmented value={range} options={RANGES} onChange={setRange} label="بازه گزارش" />
      </div>
      {model ? (
        <>
          <section className="kpi-grid">
            <Stat label="پایبندی" value={`${faInt(model.adherence)}٪`} />
            <Stat label="انجام‌شده" value={faInt(model.done)} />
            <Stat label="ازدست‌رفته" value={faInt(model.missed)} />
            <Stat label="خواب" value={faDurationHours(model.sleepAvg)} />
            <Stat label="تغییر وزن" value={model.weightDelta == null ? "—" : `${faSigned(model.weightDelta, 1)} کیلو`} />
            <Stat label="باشگاه" value={`${faInt(model.gymDone)} از ${faInt(model.gymPlanned)}`} />
            <Stat label="نظم" value={faInt(model.regularity)} />
            <Stat label="وزن / هدف" value={model.latest == null ? "—" : `${faFixed(model.latest)} / ${faFixed(model.goal, 0)}`} />
          </section>
          <section className="rounded-lg border border-line bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{range === "day" ? "کالری تجمعی" : "پایبندی روزانه"}</h3>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-accent" /> این بازه</span>
                <span className="flex items-center gap-1"><i className="h-px w-4 border-t border-dashed border-muted" /> بازه قبل</span>
              </div>
            </div>
            {model.points.length > 1 ? <TrendChart points={model.points} /> : <p className="text-sm text-muted">داده کافی نیست.</p>}
          </section>
          <section className="space-y-2 rounded-lg border border-line bg-card p-3">
            {model.insights.map((line) => (
              <p key={line} className="text-sm">
                {line}
              </p>
            ))}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted">گزارش با ساعت دستگاه ساخته می‌شود.</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-line bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </article>
  );
}
