import { useEffect, useState, type ReactNode } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { faFixed, faInt } from "@/lib/life/format";
import type { FoodItem } from "@/lib/life/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs",
            value === option.value ? "bg-raised text-fg" : "text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto py-2", props.className)} />;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[86dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-shell p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line px-3 text-sm text-muted">
            بستن
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FoodEditor({ foods, onChange }: { foods: FoodItem[]; onChange: (foods: FoodItem[]) => void }) {
  const patch = (id: string, partial: Partial<FoodItem>) =>
    onChange(foods.map((food) => (food.id === id ? { ...food, ...partial } : food)));
  return (
    <div className="space-y-2">
      {foods.map((food) => (
        <div key={food.id} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-card p-2">
          <input
            aria-label="نام غذا"
            value={food.name}
            onChange={(event) => patch(food.id, { name: event.target.value })}
            className={cn(inputClass, "col-span-2")}
            placeholder="نام"
          />
          <input
            aria-label="مقدار"
            value={food.amount}
            onChange={(event) => patch(food.id, { amount: event.target.value })}
            className={inputClass}
            placeholder="مقدار"
          />
          <input
            aria-label="کالری"
            dir="ltr"
            inputMode="decimal"
            value={String(food.kcal)}
            onChange={(event) => patch(food.id, { kcal: Number(event.target.value) || 0 })}
            className={inputClass}
            placeholder="کالری"
          />
          <input
            aria-label="پروتئین"
            dir="ltr"
            inputMode="decimal"
            value={String(food.protein)}
            onChange={(event) => patch(food.id, { protein: Number(event.target.value) || 0 })}
            className={inputClass}
            placeholder="پروتئین گرم"
          />
          <button
            type="button"
            className="h-11 rounded-lg border border-line text-sm text-bad"
            onClick={() => onChange(foods.filter((row) => row.id !== food.id))}
          >
            حذف
          </button>
        </div>
      ))}
      <button
        type="button"
        className="h-11 w-full rounded-lg border border-dashed border-line text-sm text-accent"
        onClick={() =>
          onChange([...foods, { id: `food-${Date.now()}-${foods.length}`, name: "", amount: "", kcal: 0, protein: 0 }])
        }
      >
        افزودن ماده
      </button>
    </div>
  );
}

interface ChartColors {
  accent: string;
  muted: string;
  grid: string;
  fg: string;
  card: string;
  good: string;
  warn: string;
  bad: string;
}

export function useChartColors(): ChartColors {
  const fallback: ChartColors = {
    accent: "#2dd4bf",
    muted: "#85858e",
    grid: "#26262b",
    fg: "#f4f4f5",
    card: "#18181c",
    good: "#3dd68c",
    warn: "#e6b450",
    bad: "#f07178",
  };
  const [colors, setColors] = useState<ChartColors>(fallback);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const pick = (name: string, alt: string) => style.getPropertyValue(name).trim() || alt;
      setColors({
        accent: pick("--color-accent", fallback.accent),
        muted: pick("--color-muted", fallback.muted),
        grid: pick("--color-line", fallback.grid),
        fg: pick("--color-fg", fallback.fg),
        card: pick("--color-card", fallback.card),
        good: pick("--color-good", fallback.good),
        warn: pick("--color-warn", fallback.warn),
        bad: pick("--color-bad", fallback.bad),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

export function Spark({ data, color }: { data: number[]; color: string }) {
  const rows = data.map((v, i) => ({ i, v }));
  if (rows.length < 2) return <div className="h-8" />;
  return (
    <div className="h-8 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  points,
  digits = 0,
  heightClass = "h-56",
  currentLabel = "این بازه",
  previousLabel = "بازه قبل",
}: {
  points: { label: string; current: number; previous: number }[];
  digits?: number;
  heightClass?: string;
  currentLabel?: string;
  previousLabel?: string;
}) {
  const colors = useChartColors();
  const fmt = (n: number) => (digits > 0 ? faFixed(n, digits) : faInt(n));
  return (
    <div className={cn(heightClass, "w-full min-w-0")} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: colors.grid }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs" style={{ color: colors.fg }}>
                  <div className="mb-1 text-muted">{label}</div>
                  {payload.map((row) => (
                    <div key={String(row.dataKey)}>
                      {row.dataKey === "current" ? currentLabel : previousLabel}: {fmt(Number(row.value ?? 0))}
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke={colors.accent}
            fill={colors.accent}
            fillOpacity={0.16}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke={colors.muted}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function toneClass(tone: "good" | "warn" | "bad" | "neutral"): string {
  if (tone === "good") return "bg-good/15 text-good";
  if (tone === "warn") return "bg-warn/15 text-warn";
  if (tone === "bad") return "bg-bad/15 text-bad";
  return "bg-raised text-muted";
}
