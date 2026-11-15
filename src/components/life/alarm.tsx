import type { RingHit } from "@/lib/life/logic";
import { faFixed, faInt, faTime } from "@/lib/life/format";
import { sumFoods } from "@/lib/life/logic";

export function AlarmOverlay({
  ring,
  onDone,
  onMiss,
  onSnooze,
  onStop,
}: {
  ring: RingHit;
  onDone: () => void;
  onMiss: () => void;
  onSnooze: (minutes: 5 | 10 | 15) => void;
  onStop: () => void;
}) {
  const foods = ring.resolved.displayFoods;
  const sums = sumFoods(foods);
  const loud = ring.mode === "alarm";
  const when = new Date(ring.moment);
  const clock = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  return (
    <div className={loud ? "fixed inset-0 z-50 flex items-end justify-center bg-bg/90 p-4 sm:items-center" : "fixed inset-x-0 top-3 z-50 px-3"}>
      <section
        role="alertdialog"
        aria-label={ring.resolved.displayTitle}
        className={`w-full max-w-md rounded-xl border border-line bg-shell p-4 ${loud ? "pulse" : ""}`}
      >
        <p className="text-xs text-accent">{loud ? "آلارم" : ring.mode === "loud" ? "یادآوری بلند" : "یادآوری"}</p>
        <p className="tabular mt-1 text-sm text-muted">{faTime(clock)}</p>
        <h2 className="mt-1 text-2xl font-semibold">{ring.resolved.displayTitle}</h2>
        <p className="mt-2 text-sm text-muted">{ring.resolved.displayDescription}</p>
        {foods.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {foods.map((food) => (
              <li key={food.id} className="flex justify-between gap-2">
                <span>
                  {food.name}
                  {food.amount ? ` · ${food.amount}` : ""}
                </span>
                <span className="tabular text-muted">{faInt(food.kcal)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {foods.length ? (
          <p className="mt-2 text-xs text-muted">
            جمع تخمینی {faInt(Math.round(sums.kcal))} کالری و {faFixed(sums.protein)} گرم پروتئین
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-lg bg-good text-sm text-good-ink" onClick={onDone}>
            انجام شد
          </button>
          <button type="button" className="h-11 rounded-lg bg-bad text-sm text-bad-ink" onClick={onMiss}>
            انجام نشد
          </button>
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => onSnooze(5)}>
            تعویق ۵
          </button>
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => onSnooze(10)}>
            تعویق ۱۰
          </button>
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={() => onSnooze(15)}>
            تعویق ۱۵
          </button>
          <button type="button" className="h-11 rounded-lg border border-line text-sm" onClick={onStop}>
            توقف زنگ
          </button>
        </div>
      </section>
    </div>
  );
}
