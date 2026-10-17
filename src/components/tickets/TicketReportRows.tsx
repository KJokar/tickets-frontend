"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { getTicketReportRows, type TicketReportRow } from "@/lib/tickets";
import { useTicketData } from "./useTicketData";

export function ReportRowsTable({ rows, offset = 0, printable = false }: { rows: TicketReportRow[]; offset?: number; printable?: boolean }) {
  return <div className="ticket-table-wrap"><table className="ticket-table report-rows-table">
    <thead><tr><th scope="col">ردیف</th><th scope="col">نام مشتری</th><th scope="col">عنوان درخواست</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}>
      <td>{(offset + index + 1).toLocaleString("fa-IR")}</td><td>{row.customerName}</td>
      <td>{printable ? row.title : <Link href={`/support/tickets/${row.id}`}>{row.title}</Link>}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function TicketReportRows({ from, to }: { from: string; to: string }) {
  const [page, setPage] = useState(1);
  const loader = useCallback((signal: AbortSignal) => getTicketReportRows({ from, to, page, perPage: 10 }, signal), [from, to, page]);
  const resource = useTicketData(loader);
  const result = resource.data;
  return <section className="report-ticket-list report-screen-rows" aria-labelledby="report-rows-title" aria-busy={resource.loading}>
    <h2 id="report-rows-title">فهرست درخواست‌ها</h2>
    <p className="report-scope">نام مشتری و عنوان درخواست‌های پذیرفته‌شده در همین بازهٔ زمانی</p>
    {resource.error && <p className="notice error-notice" role="alert">{resource.error} <button className="text-link inline-retry" onClick={resource.reload} type="button">تلاش دوباره</button></p>}
    {resource.loading && <p className="report-loading" role="status">در حال دریافت فهرست…</p>}
    {result && (result.items.length ? <ReportRowsTable rows={result.items} offset={(result.pagination.page - 1) * result.pagination.perPage} /> : <p className="report-empty">درخواستی برای نمایش در این صفحه وجود ندارد.</p>)}
    {result && result.pagination.totalItems > 0 && <div className="ticket-pagination report-rows-pagination" aria-label="صفحه‌بندی فهرست گزارش">
      <span>{result.pagination.totalItems.toLocaleString("fa-IR")} درخواست</span><div>
        <button type="button" disabled={page <= 1 || resource.loading} onClick={() => setPage(value => value - 1)}>قبلی</button>
        <span>صفحه {page.toLocaleString("fa-IR")} از {Math.max(1, result.pagination.totalPages).toLocaleString("fa-IR")}</span>
        <button type="button" disabled={page >= result.pagination.totalPages || resource.loading} onClick={() => setPage(value => value + 1)}>بعدی</button>
      </div>
    </div>}
  </section>;
}
