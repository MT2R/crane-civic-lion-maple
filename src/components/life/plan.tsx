import { useState } from "react";
import { KIND_LABEL, MODE_LABEL, WEEK_OPTIONS, faTime } from "@/lib/life/format";
import { isValidTime, sortItems } from "@/lib/life/logic";
import { useLife } from "@/lib/life/store";
import type { FoodItem, ItemKind, NotifyMode, ScheduleItem } from "@/lib/life/types";
import { Field, FoodEditor, Modal, TextArea, TextInput } from "./ui";

const KINDS = Object.keys(KIND_LABEL) as ItemKind[];
const MODES = Object.keys(MODE_LABEL) as NotifyMode[];

export function PlanView() {
  const items = useLife((s) => s.items);
  const updateItem = useLife((s) => s.updateItem);
  const addItem = useLife((s) => s.addItem);
  const removeItem = useLife((s) => s.removeItem);
  const [editId, setEditId] = useState<string | null>(null);
  const current = items.find((item) => item.id === editId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">برنامه روزانه</h2>
          <p className="text-xs text-muted">ساعت، عنوان، غذا و نوع یادآوری هر وعده را عوض کن.</p>
        </div>
        <button
          type="button"
          className="h-11 rounded-lg bg-accent px-3 text-sm text-accent-ink"
          onClick={() => setEditId(addItem())}
        >
          وعده جدید
        </button>
      </div>
      <ul className="space-y-2">
        {sortItems(items).map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-lg border border-line bg-card p-3">
            <time className="tabular w-12 shrink-0 text-sm">{faTime(item.time)}</time>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted">
                {KIND_LABEL[item.kind]} · {MODE_LABEL[item.notifyMode]}
                {item.enabled ? "" : " · خاموش"}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={item.enabled}
              className={`h-11 rounded-lg px-3 text-sm ${item.enabled ? "bg-accent/15 text-accent" : "border border-line text-muted"}`}
              onClick={() => updateItem(item.id, { enabled: !item.enabled })}
            >
              {item.enabled ? "فعال" : "خاموش"}
            </button>
            <button type="button" className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setEditId(item.id)}>
              ویرایش
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <Editor
          item={current}
          onClose={() => setEditId(null)}
          onChange={(patch) => updateItem(current.id, patch)}
          onFoods={(foods, which) => useLife.getState().setFoods(current.id, foods, which)}
          onDelete={() => {
            removeItem(current.id);
            setEditId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Editor({
  item,
  onClose,
  onChange,
  onFoods,
  onDelete,
}: {
  item: ScheduleItem;
  onClose: () => void;
  onChange: (patch: Partial<ScheduleItem>) => void;
  onFoods: (foods: FoodItem[], which: "foods" | "restFoods") => void;
  onDelete: () => void;
}) {
  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="ساعت">
            <TextInput
              dir="ltr"
              type="time"
              value={item.time}
              onChange={(event) => {
                if (isValidTime(event.target.value)) onChange({ time: event.target.value });
              }}
            />
          </Field>
          <Field label="نوع">
            <select
              className="h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
              value={item.kind}
              onChange={(event) => onChange({ kind: event.target.value as ItemKind })}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="عنوان">
          <TextInput value={item.title} onChange={(event) => onChange({ title: event.target.value })} />
        </Field>
        <Field label="توضیح">
          <TextArea rows={2} value={item.description} onChange={(event) => onChange({ description: event.target.value })} />
        </Field>
        <Field label="نوع یادآوری">
          <select
            className="h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
            value={item.notifyMode}
            onChange={(event) => onChange({ notifyMode: event.target.value as NotifyMode })}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <p className="mb-1 text-xs text-muted">روزهای تکرار</p>
          <div className="flex flex-wrap gap-1">
            {WEEK_OPTIONS.map((day) => {
              const on = item.days.includes(day.d);
              return (
                <button
                  key={day.d}
                  type="button"
                  aria-pressed={on}
                  aria-label={day.full}
                  className={`h-11 w-11 rounded-lg text-sm ${on ? "bg-accent text-accent-ink" : "border border-line text-muted"}`}
                  onClick={() => onChange({ days: on ? item.days.filter((d) => d !== day.d) : [...item.days, day.d] })}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm">مواد غذایی</p>
          <FoodEditor foods={item.foods} onChange={(foods) => onFoods(foods, "foods")} />
        </div>
        {item.kind === "preworkout" ? (
          <div>
            <p className="mb-1 text-sm">جایگزین روز استراحت</p>
            <Field label="عنوان روز استراحت">
              <TextInput value={item.restTitle} onChange={(event) => onChange({ restTitle: event.target.value })} />
            </Field>
            <div className="mt-2">
              <FoodEditor foods={item.restFoods} onChange={(foods) => onFoods(foods, "restFoods")} />
            </div>
          </div>
        ) : null}
        <button type="button" className="h-11 w-full rounded-lg border border-line text-sm text-bad" onClick={onDelete}>
          حذف این وعده
        </button>
      </div>
    </Modal>
  );
}
