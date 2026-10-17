"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatPersianDate, fromPersianDate, persianMonthLength, persianMonths, toPersianDate } from "@/lib/persian-date";

export function PersianDatePicker({ label, value, onChange, min = "2000-01-01", max = "2100-12-31" }: {
  label: string; value: string; onChange: (iso: string) => void; min?: string; max?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: 1405, month: 1 });
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const minYear = toPersianDate(min).year, maxYear = toPersianDate(max).year;
  function close() { setOpen(false); trigger.current?.focus(); }
  function show() {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const initial = value || today;
    setView(toPersianDate(initial < min ? min : initial > max ? max : initial));
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({ top: Math.max(8, Math.min(rect.bottom + 8, innerHeight - 390)), left: Math.max(8, Math.min(rect.right - 304, innerWidth - 312)) });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!dialog.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    dialog.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const first = fromPersianDate(view.year, view.month, 1);
  const offset = (new Date(first + "T12:00:00Z").getUTCDay() + 1) % 7;
  const length = persianMonthLength(view.year, view.month);
  function move(amount: number) { const month = view.month + amount; setView({ year: view.year + (month < 1 ? -1 : month > 12 ? 1 : 0), month: month < 1 ? 12 : month > 12 ? 1 : month }); }
  return <div className="persian-date-field">
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} className="persian-date-trigger" type="button" aria-labelledby={`${id}-label`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? close() : show()}>
      <span>{value ? formatPersianDate(value) : ""}</span><span aria-hidden="true">▦</span>
    </button>
    {open && createPortal(<div id={id} ref={dialog} role="dialog" aria-label={`تقویم ${label}`} className="persian-calendar" style={position} dir="rtl">
      <div className="persian-calendar-header"><button type="button" aria-label="ماه قبل" disabled={view.year === minYear && view.month === 1} onClick={() => move(-1)}>‹</button>
        <select aria-label={`ماه ${label}`} value={view.month} onChange={event => setView({ ...view, month: Number(event.target.value) })}>{persianMonths.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select>
        <select aria-label={`سال ${label}`} value={view.year} onChange={event => setView({ ...view, year: Number(event.target.value) })}>{Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index).map(year => <option key={year} value={year}>{year.toLocaleString("fa-IR", { useGrouping: false })}</option>)}</select>
        <button type="button" aria-label="ماه بعد" disabled={view.year === maxYear && view.month === 12} onClick={() => move(1)}>›</button></div>
      <div className="persian-calendar-grid" role="grid" aria-label={`${persianMonths[view.month - 1]} ${view.year.toLocaleString("fa-IR", { useGrouping: false })}`}>
        {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((day, index) => <span role="columnheader" key={day} aria-label={["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][index]}>{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length }, (_, index) => index + 1).map(day => { const iso = fromPersianDate(view.year, view.month, day); return <button role="gridcell" type="button" key={day} aria-selected={value === iso} aria-label={`${day.toLocaleString("fa-IR")} ${persianMonths[view.month - 1]} ${view.year.toLocaleString("fa-IR", { useGrouping: false })}`} disabled={iso < min || iso > max} onClick={() => { onChange(iso); close(); }}>{day.toLocaleString("fa-IR")}</button>; })}
      </div>
      <div className="persian-calendar-footer"><button type="button" onClick={() => { onChange(""); close(); }}>پاک کردن</button><button type="button" onClick={close}>بستن</button></div>
    </div>, document.body)}
  </div>;
}
