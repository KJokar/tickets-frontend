"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { englishDigits, type Country } from "@/lib/phone";

const label = (country: Country) => country.isoCode === "IR" ? "ایران" : country.name;
const normalizeSearch = (value: string) => englishDigits(value).normalize("NFKC").replace(/[يى]/g, "ی").replace(/ك/g, "ک").trim().toLocaleLowerCase();
const contains = (element: HTMLElement | null, target: EventTarget | null) => target instanceof Node && !!element?.contains(target);
function Flag({ country, lazy = false }: { country: Country; lazy?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- Local SVG flags must also render inside list options.
  return <img src={`/flags/${country.isoCode.toLowerCase()}.svg`} alt="" width={24} height={18} loading={lazy ? "lazy" : undefined} />;
}

export function CountrySelect({ countries, value, onChange, disabled, error }: {
  countries: Country[]; value: number; onChange: (value: number) => void; disabled?: boolean; error?: string;
}) {
  const selected = countries.find(country => country.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>({ left: 0, top: 0, width: 300, maxHeight: 300 });
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const unavailable = disabled || !countries.length;
  const expanded = open && !unavailable;
  const searchable = useMemo(() => {
    const names = new Intl.DisplayNames(["fa"], { type: "region" });
    return countries.map(country => ({ country, text: normalizeSearch(`${label(country)} ${country.name} ${names.of(country.isoCode)} ${country.isoCode} ${country.phoneCode}`) }));
  }, [countries]);
  const term = normalizeSearch(query);
  const filtered = searchable.filter(item => item.text.includes(term)).map(item => item.country);
  const active = filtered[activeIndex];

  function placeMenu() {
    const bounds = anchor.current?.getBoundingClientRect();
    if (!bounds) return;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? innerHeight);
    const width = Math.min(Math.max(bounds.width, 300), innerWidth - 24);
    const below = viewportBottom - bounds.bottom - 16;
    const above = bounds.top - viewportTop - 16;
    const upwards = below < 220 && above > below;
    const maxHeight = Math.max(80, Math.min(300, upwards ? above : below));
    setPosition({ left: Math.max(12, Math.min(bounds.right - width, innerWidth - width - 12)), top: upwards ? undefined : bounds.bottom + 6, bottom: upwards ? innerHeight - bounds.top + 6 : undefined, width, maxHeight });
  }
  function reveal() {
    if (unavailable) return;
    placeMenu(); setQuery(""); setActiveIndex(Math.max(0, countries.findIndex(country => country.id === value))); setOpen(true);
  }
  function choose(country: Country) {
    onChange(country.id); setOpen(false); setQuery(""); input.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); input.current?.focus(); } return; }
    if (event.key === "Tab" && event.currentTarget === search.current) {
      event.preventDefault(); setOpen(false);
      const fields = Array.from(input.current?.form?.elements ?? []).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.hasAttribute("disabled") && element.getAttribute("type") !== "hidden" && element.tabIndex >= 0);
      const index = fields.indexOf(input.current!);
      (fields[index + (event.shiftKey ? -1 : 1)] ?? input.current)?.focus(); return;
    }
    if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      event.preventDefault();
      if (!expanded) { reveal(); return; }
      if (event.key === "Enter") { if (active) choose(active); return; }
      setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (expanded && (event.key === "Home" || event.key === "End") && !query) {
      event.preventDefault(); setActiveIndex(event.key === "Home" ? 0 : filtered.length - 1);
    } else if (!expanded && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); placeMenu(); setQuery(event.key); setActiveIndex(0); setOpen(true);
    }
  }
  useEffect(() => {
    if (!expanded) return;
    search.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!contains(anchor.current, event.target) && !contains(menu.current, event.target)) setOpen(false);
    };
    const reposition = (event: Event) => { if (!contains(menu.current, event.target)) placeMenu(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition); window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition); window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [expanded]);
  useEffect(() => {
    if (expanded && active) document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, listId]);

  return <>
    <div className={`pair-input-wrap pair-country-wrap${expanded ? " country-select-open" : ""}`} ref={anchor}
      onClick={event => { if (event.target !== input.current) { if (expanded) { setOpen(false); input.current?.focus(); } else { input.current?.focus(); reveal(); } } }}>
      {selected && <Flag country={selected} />}
      <input ref={input} id="countryId" className="country-select-input" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active ? `${listId}-${active.id}` : undefined}
        aria-invalid={!!error} aria-describedby={error ? "country-error" : undefined} autoComplete="off" spellCheck={false} disabled={unavailable} readOnly dir={selected ? "ltr" : "auto"}
        value={selected?.phoneCode ?? ""} placeholder={error ? "دریافت کشورها ناموفق بود" : !countries.length ? "در حال دریافت کشورها…" : "کشور را انتخاب کنید"}
        onClick={() => { if (!expanded) reveal(); else search.current?.focus(); }} onKeyDown={keyboard}
        onBlur={event => { if (!contains(menu.current, event.relatedTarget)) setOpen(false); }} />
      <input type="hidden" name="countryId" value={selected?.id ?? ""} />
      <svg className="country-select-arrow" viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={expanded ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} /></svg>
    </div>
    {expanded && createPortal(<div className="country-select-menu" ref={menu} style={position} dir="rtl">
      <div className="country-select-search">
        <svg width={17} height={17} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <input ref={search} type="search" aria-label="جست‌وجوی کشور" aria-controls={listId} aria-activedescendant={active ? `${listId}-${active.id}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={keyboard}
          onBlur={event => { if (!contains(menu.current, event.relatedTarget) && !contains(anchor.current, event.relatedTarget)) setOpen(false); }}
          placeholder="نام کشور یا پیش‌شماره را بنویسید…" autoComplete="off" spellCheck={false} dir="auto" />
      </div>
      <ul id={listId} role="listbox" aria-label="کشورها">
        {filtered.map((country, index) => <li id={`${listId}-${country.id}`} key={country.id} role="option" aria-selected={country.id === value}
          className={`country-select-option${index === activeIndex ? " is-active" : ""}${country.id === value ? " is-selected" : ""}`}
          onPointerMove={() => setActiveIndex(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(country)}>
          <Flag country={country} lazy /><span dir="auto">{label(country)}</span><bdi dir="ltr">{country.phoneCode}</bdi>
          {country.id === value && <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
        </li>)}
        {!filtered.length && <li className="country-select-empty" role="presentation">کشوری پیدا نشد.</li>}
      </ul>
    </div>, document.body)}
  </>;
}
