"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getAllTicketReportRows, getTicketReport, statusLabels, ticketDate, ticketErrorMessage, TicketApiError, type TicketReportRow, type TicketStatus } from "@/lib/tickets";
import { useTicketData } from "./useTicketData";
import { PersianDatePicker } from "./PersianDatePicker";
import { downloadReportPdf } from "@/lib/report-pdf";
import { ReportRowsTable, TicketReportRows } from "./TicketReportRows";

const statuses: { key: TicketStatus; field: "open" | "inProgress" | "answered" | "closed"; color: string }[] = [
  { key: "InProgress", field: "inProgress", color: "#d49b32" },
  { key: "Answered", field: "answered", color: "#9274ca" }, { key: "Closed", field: "closed", color: "#30a18a" },
];
const number = (value: number) => value.toLocaleString("fa-IR");
function date(value: string) { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value + "T12:00:00Z")); }

export function TicketReports() {
  const { user } = useAuth();
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState(draft);
  const [formError, setFormError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "print" | null>(null);
  const [printRows, setPrintRows] = useState<TicketReportRow[] | null>(null);
  useEffect(() => {
    if (!printRows) return;
    const timer = setTimeout(() => {
      try { window.print(); }
      finally { setPrintRows(null); setExporting(null); }
    }, 0);
    return () => clearTimeout(timer);
  }, [printRows]);
  const chart = useRef<HTMLDivElement>(null);
  const activeBar = useRef<SVGGElement | null>(null);
  const tooltipId = useId();
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  function showDay(element: SVGGElement, day: { date: string; count: number }) {
    const bounds = chart.current?.getBoundingClientRect();
    if (!bounds) return;
    activeBar.current = element;
    const bar = element.getBoundingClientRect();
    setHoveredDay({ ...day, x: Math.max(8, Math.min(bounds.width - 192, bar.x + bar.width / 2 - bounds.x - 92)), y: Math.max(8, bar.y - bounds.y - 82) });
  }
  const loader = useCallback((signal: AbortSignal) => getTicketReport(filters, signal), [filters]);
  const resource = useTicketData(loader);
  const report = resource.data;
  const summary = report?.summary;
  const total = summary?.total ?? 0;
  const days = report?.dailyCreated ?? [];
  const maximum = Math.max(1, ...days.map(day => day.count));
  const scopeLabel = "فقط درخواست‌های پذیرفته‌شدهٔ من";
  const exportDisabled = !report || resource.loading || !!resource.error || !!formError || exporting !== null;
  async function download(kind: "pdf" | "print") {
    if (!report || exportDisabled) return;
    setExporting(kind);
    setExportError("");
    try {
      const rows = await getAllTicketReportRows(report);
      if (rows.length !== report.summary.total) throw new TicketApiError("اطلاعات گزارش تغییر کرده است. گزارش را دوباره دریافت کنید.", 409);
      if (kind === "print") { setPrintRows(rows); return; }
      await downloadReportPdf(report, user?.fullName ?? "پشتیبان", rows);
      setExporting(null);
    }
    catch (error) { setExportError(ticketErrorMessage(error)); setExporting(null); }
  }
  const pie = statuses.reduce<{ start: number; key: TicketStatus; color: string; value: number }[]>((items, status) => {
    const start = items.reduce((sum, item) => sum + item.value, 0);
    return [...items, { start, key: status.key, color: status.color, value: summary?.[status.field] ?? 0 }];
  }, []);
  const chartWidth = 900, chartHeight = 255, left = 48, top = 18, plotHeight = 190, plotWidth = 830;
  return <section className="ticket-reports">
    <div className="page-heading"><div><p className="eyebrow">آمار و روند رسیدگی</p><h1>گزارش درخواست‌ها</h1><p className="report-scope">{scopeLabel} · {user?.fullName}</p></div>
      <div className="report-actions"><button className="primary-button compact-button report-download" type="button" disabled={exportDisabled} onClick={() => void download("pdf")}>{exporting === "pdf" ? "در حال ساخت PDF…" : "دانلود PDF"}</button><button className="primary-button compact-button report-print secondary-report-action" type="button" disabled={exportDisabled} onClick={() => void download("print")}>{exporting === "print" ? "در حال آماده‌سازی…" : "پرینت"}</button></div></div>
    <form className="ticket-filters report-filters" onSubmit={event => {
      event.preventDefault();
      if (draft.from && draft.to && (draft.from > draft.to || (Date.parse(draft.to) - Date.parse(draft.from)) / 86400000 > 365)) { setFormError("بازهٔ گزارش باید حداکثر ۳۶۶ روز و تاریخ پایان بعد از شروع باشد."); return; }
      setFormError(""); setFilters({ ...draft });
    }}>
      <PersianDatePicker label="از تاریخ" value={draft.from} max={draft.to || "2100-12-31"} onChange={from => setDraft({ ...draft, from })} />
      <PersianDatePicker label="تا تاریخ" value={draft.to} min={draft.from || "2000-01-01"} onChange={to => setDraft({ ...draft, to })} />
      <button type="submit" className="primary-button compact-button" disabled={resource.loading || exporting !== null}>نمایش گزارش</button>
    </form>
    {(formError || resource.error || exportError) && <p className="notice error-notice" role="alert">{formError || resource.error || exportError} <button className="text-link" type="button" onClick={() => { setFormError(""); setExportError(""); resource.reload(); }}>تلاش دوباره</button></p>}
    {resource.loading && <p className="report-loading" role="status">در حال دریافت گزارش…</p>}
    {report && summary && <div className="report-content" aria-busy={resource.loading}>
      <p className="report-period">{date(report.from)} تا {date(report.to)} · بر اساس تاریخ ثبت درخواست · ساعت تهران</p>
      <div className="report-statistics">
        {[["کل درخواست‌ها", summary.total], ["در حال رسیدگی", summary.open + summary.inProgress], ["پاسخ داده‌شده", summary.answered], ["بسته‌شده", summary.closed]].map(([label, value]) => <article className="report-stat" key={label}><span>{label}</span><strong>{number(Number(value))}</strong></article>)}
      </div>
      {total === 0 && <p className="report-empty">در این بازهٔ زمانی، درخواستی برای نمایش وجود ندارد.</p>}
      <div className="report-charts">
        <figure className="report-chart report-bars"><figcaption><h2>روند ثبت درخواست‌ها</h2><p>تعداد درخواست‌های ثبت‌شده در هر روز</p></figcaption>
          <div className="report-bar-chart" ref={chart}>
          <div className="report-svg-scroll" onScroll={() => { if (hoveredDay && activeBar.current) showDay(activeBar.current, hoveredDay); }}><svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="group" aria-label="نمودار میله‌ای ثبت روزانه درخواست‌ها">
            {[0, 1, 2, 3, 4].map(step => { const value = Math.ceil(maximum / 4) * step; const ceiling = Math.ceil(maximum / 4) * 4; const y = top + plotHeight * (1 - value / ceiling); return <g key={step}><line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="#dbe5ed" /><text x={left - 12} y={y + 4} textAnchor="end">{number(value)}</text></g>; })}
            {days.map((day, index) => { const ceiling = Math.ceil(maximum / 4) * 4; const width = plotWidth / days.length; const height = day.count / ceiling * plotHeight; return <g key={day.date} className="report-bar-group" tabIndex={0} role="img" aria-label={`${date(day.date)}، تعداد درخواست: ${number(day.count)}`} aria-describedby={hoveredDay?.date === day.date ? tooltipId : undefined} data-date={day.date} onPointerEnter={event => showDay(event.currentTarget, day)} onPointerLeave={() => setHoveredDay(null)} onFocus={event => showDay(event.currentTarget, day)} onBlur={() => setHoveredDay(null)} onKeyDown={event => { if (event.key === "Escape") setHoveredDay(null); }}>
              <rect className="report-bar-target" x={left + index * width} y={top} width={width} height={plotHeight} fill="transparent" />
              <rect className="report-bar" x={left + index * width + width * .14} y={top + plotHeight - height} width={Math.max(1, width * .72)} height={height} rx={Math.min(4, width * .2)} fill="#3174cc" />
              {(index % Math.max(1, Math.ceil(days.length / 7)) === 0 || index === days.length - 1) && <text x={left + (index + .5) * width} y={top + plotHeight + 26} textAnchor="middle">{new Intl.DateTimeFormat("fa-IR", { month: "numeric", day: "numeric", timeZone: "Asia/Tehran" }).format(new Date(day.date + "T12:00:00Z"))}</text>}</g>; })}
          </svg></div>
          {hoveredDay && <div className="report-bar-tooltip" role="tooltip" id={tooltipId} dir="rtl" style={{ left: `clamp(8px, ${hoveredDay.x}px, calc(100% - 192px))`, top: hoveredDay.y }}>
            <div><span>تاریخ</span><bdi dir="rtl">{date(hoveredDay.date)}</bdi></div>
            <div><span>تعداد درخواست</span><bdi dir="ltr">{number(hoveredDay.count)}</bdi></div>
          </div>}
          </div>
        </figure>
        <figure className="report-chart report-pie"><figcaption><h2>توزیع وضعیت درخواست‌ها</h2><p>وضعیت فعلی درخواست‌های ثبت‌شده در بازه</p></figcaption>
          <svg viewBox="0 0 240 240" role="img" aria-label="نمودار دایره‌ای وضعیت درخواست‌ها">
            <circle cx="120" cy="120" r="78" fill="none" stroke="#e8eef4" strokeWidth="36" />
            {total > 0 && pie.filter(item => item.value).map(item => <circle key={item.key} cx="120" cy="120" r="78" fill="none" stroke={item.color} strokeWidth="36" pathLength="100" strokeDasharray={`${item.value / total * 100} ${100 - item.value / total * 100}`} strokeDashoffset={-item.start / total * 100} transform="rotate(-90 120 120)"><title>{statusLabels[item.key]}: {number(item.value)} درخواست</title></circle>)}
            <text x="120" y="119" textAnchor="middle" className="report-pie-total">{number(total)}</text><text x="120" y="142" textAnchor="middle">درخواست</text>
          </svg>
          <ul className="report-legend">{pie.map(item => <li key={item.key} style={{ "--report-color": item.color } as CSSProperties}><i aria-hidden="true" /><span>{statusLabels[item.key]}</span><b>{number(item.value)}</b><small>{number(total ? Math.round(item.value / total * 100) : 0)}٪</small></li>)}</ul>
        </figure>
      </div>
      <TicketReportRows key={`${report.from}:${report.to}:${report.generatedAt}`} from={report.from} to={report.to} />
      {printRows && <section className="report-ticket-list report-print-rows"><h2>فهرست درخواست‌ها</h2><ReportRowsTable rows={printRows} printable /></section>}
      <p className="report-footnote">سهم درخواست‌های بسته‌شده: {number(total ? Math.round(summary.closed / total * 100) : 0)}٪ · زمان تهیهٔ گزارش: {ticketDate(report.generatedAt)}</p>
    </div>}
  </section>;
}
