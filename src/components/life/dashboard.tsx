import { faFixed, faInt, faRemain, faTime } from "@/lib/life/format";
import type { HomeModel, TodayRow } from "@/lib/life/logic";
import type { MealStatus, ScheduleItem } from "@/lib/life/types";
import { Spark, toneClass, TrendChart, useChartColors } from "./ui";

const STATUS_LABEL: Record<MealStatus, string> = {
  done: "شد",
  missed: "نشد",
  snoozed: "بعداً",
  pending: "مانده",
};

function statusClass(status: MealStatus, active: boolean): string {
  if (!active) return "border border-line text-muted";
  if (status === "done") return "bg-good text-good-ink";
  if (status === "missed") return "bg-bad text-bad-ink";
  if (status === "snoozed") return "bg-warn text-warn-ink";
  return "bg-raised text-fg";
}

export function Dashboard({
  model,
  now,
  items,
  onlyOpen,
  onStatus,
  onOpen,
}: {
  model: HomeModel | null;
  now: Date | null;
  items: ScheduleItem[];
  onlyOpen: boolean;
  onStatus: (id: string, status: MealStatus) => void;
  onOpen: (id: string) => void;
}) {
  const colors = useChartColors();
  const rows = (model?.rows ?? items.map(fallbackRow)).filter((row) => (onlyOpen ? row.status !== "done" : true));
  const maxBar = Math.max(1, ...(model?.bars.map((bar) => bar.value) ?? [1]));
  const remain = model?.next && now ? model.next.when - now.getTime() : model?.next?.remainMs ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{model?.dateLabel ?? "امروز"}</span>
        <span className="tabular text-sm text-fg">{now ? faTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`) : "—:—"}</span>
        <span className={model?.gym ? "rounded-full bg-accent/15 px-2 py-0.5 text-accent" : "rounded-full bg-raised px-2 py-0.5"}>
          {model ? (model.gym ? "روز باشگاه" : "روز استراحت") : "برنامه"}
        </span>
        <span>کار {model ? faTime(model.work) : "۰۸:۳۰"}</span>
      </div>

      <section className="kpi-grid">
        {(model?.kpis ?? PLACEHOLDER_KPIS).map((kpi) => {
          const delta = kpi.id === "next" && model?.next ? faRemain(remain) : kpi.delta;
          const stroke = kpi.tone === "bad" ? colors.muted : kpi.tone === "warn" ? colors.warn : colors.accent;
          return (
            <article key={kpi.id} className="min-w-0 rounded-lg border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs text-muted">{kpi.label}</p>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${toneClass(kpi.tone)}`}>{delta}</span>
              </div>
              <p className="tabular mt-2 text-xl font-semibold tracking-tight">{kpi.value}</p>
              {model ? <Spark data={kpi.spark} color={stroke} /> : <div className="h-8" />}
            </article>
          );
        })}
      </section>

      <div className="split">
        <section className="min-w-0 rounded-lg border border-line bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{model?.chartTitle ?? "کالری تجمعی وعده‌ها"}</h2>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-4 bg-accent" /> این بازه
              </span>
              <span className="flex items-center gap-1">
                <i className="h-px w-4 border-t border-dashed border-muted" /> بازه قبل
              </span>
            </div>
          </div>
          {model && model.points.length > 1 ? (
            <TrendChart points={model.points} digits={model.chartTitle === "روند وزن" ? 1 : 0} />
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted">نمودار با داده‌های امروز پر می‌شود.</div>
          )}
        </section>
        <section className="min-w-0 rounded-lg border border-line bg-card p-3">
          <h2 className="text-sm font-medium">به تفکیک وعده</h2>
          <p className="mb-3 text-xs text-muted">{model?.barCaption ?? "برنامه کالری، تخمینی"}</p>
          <div className="space-y-3">
            {(model?.bars ?? []).map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-sm bg-accent" />
                    {bar.label}
                  </span>
                  <span className="tabular">{faInt(bar.value)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-track">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (bar.value / maxBar) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-card p-3">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">برنامه امروز</h2>
            <p className="text-xs text-muted">
              {model
                ? `${faInt(model.done)} از ${faInt(model.total)} انجام شده · ${faInt(Math.round(model.consumedKcal))} از ${faInt(Math.round(model.plannedKcal))} کالری · پروتئین ${faFixed(model.consumedProtein)} گرم`
                : "وضعیت‌ها بعد از همگام‌شدن ساعت دستگاه مشخص می‌شوند."}
            </p>
          </div>
          {model?.next ? (
            <p className="text-xs text-accent">
              بعدی: {model.next.title} · {faRemain(remain)}
            </p>
          ) : null}
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-line bg-shell p-3">
              <div className="flex items-start gap-3">
                <time className="tabular w-12 shrink-0 text-sm text-muted">{faTime(row.time)}</time>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="text-right text-sm font-medium" onClick={() => onOpen(row.id)}>
                      {row.title}
                    </button>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${statusClass(row.status, true)}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{row.foods || row.description}</p>
                  <p className="tabular mt-1 text-xs text-muted">
                    {faInt(row.kcal)} کالری · {faFixed(row.protein)} گرم پروتئین
                    {row.status !== "done" ? " · تخمین برنامه" : " · ثبت‌شده"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <StatusButton label="شد" pressed={row.status === "done"} status="done" onClick={() => onStatus(row.id, "done")} />
                <StatusButton label="نشد" pressed={row.status === "missed"} status="missed" onClick={() => onStatus(row.id, "missed")} />
                <StatusButton label="بعداً" pressed={row.status === "snoozed"} status="snoozed" onClick={() => onStatus(row.id, "snoozed")} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">کالری و پروتئین تخمین آشپزخانه‌اند، نه توصیه یا تشخیص پزشکی.</p>
        {model?.plateau ? (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            وزن چند هفته تقریباً ثابت مانده. مقدار غذای روزانه را بازبینی کن؛ مثلاً یک میان‌وعده یا سهم برنج و مغزها را کمی بیشتر کن.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function StatusButton({
  label,
  pressed,
  status,
  onClick,
}: {
  label: string;
  pressed: boolean;
  status: MealStatus;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`h-11 rounded-lg text-sm ${statusClass(status, pressed)}`}>
      {label}
    </button>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fallbackRow(item: ScheduleItem): TodayRow {
  const kcal = item.foods.reduce((s, f) => s + f.kcal, 0);
  const protein = item.foods.reduce((s, f) => s + f.protein, 0);
  return {
    id: item.id,
    time: item.time,
    title: item.title,
    description: item.description,
    foods: item.foods.map((f) => f.name).join("، "),
    status: "pending",
    kcal,
    protein,
    kind: item.kind,
  };
}

const PLACEHOLDER_KPIS = [
  { id: "weight", label: "وزن", value: "—", delta: "…", tone: "neutral" as const, spark: [52, 53] },
  { id: "next", label: "وعده بعد", value: "—", delta: "…", tone: "neutral" as const, spark: [0, 1] },
  { id: "sleep", label: "خواب", value: "—", delta: "…", tone: "neutral" as const, spark: [7, 8] },
  { id: "adherence", label: "پایبندی", value: "—", delta: "…", tone: "neutral" as const, spark: [40, 70] },
];
