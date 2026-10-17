"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { canCreateTicket, type UserRole } from "@/lib/auth";
import {
  createTicket, getTicketSummary, listTickets, priorityLabels,
  statusLabels, ticketDate, ticketErrorMessage, TicketApiError, type TicketListItem, type TicketSortBy, type TicketSortOrder,
} from "@/lib/tickets";
import { useTicketData } from "./useTicketData";
import { TicketChatContainer } from "./TicketChatContainer";
import { useTicketListUpdates } from "./TicketRealtime";
import { ChatIcon } from "./ChatIcon";
import { TicketMediaPicker } from "./TicketMediaPicker";

function Feedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (error) return <div className="notice error-notice ticket-feedback" role="alert">{error} <button className="text-link inline-retry" type="button" onClick={retry}>تلاش دوباره</button></div>;
  return loading ? <p className="ticket-loading" role="status">در حال دریافت درخواست‌ها...</p> : null;
}
function EmptyTickets() {
  return <section className="list-empty-state"><span className="empty-mark" aria-hidden="true">—</span><h2>درخواستی پیدا نشد</h2><p>هنوز درخواستی در این فهرست وجود ندارد.</p></section>;
}
function TicketTable({ items, role, rowOffset = 0 }: { items: TicketListItem[]; role: UserRole; rowOffset?: number }) {
  if (!items.length) return <EmptyTickets />;
  return <div className="ticket-table-wrap"><table className="ticket-table">
    <thead><tr><th>ردیف</th><th>موضوع</th>{role === "agent" ? <><th>فرستنده</th><th>اولویت</th></> : <th>پشتیبان</th>}<th>وضعیت</th><th>آخرین تغییر</th></tr></thead>
    <tbody>{items.map((item, index) => {
      const unread = item.hasUnreadMessages && (item.status === "Open" || item.status === "InProgress" || role === "client" && item.status === "Answered");
      return <tr key={item.id} className={unread ? "ticket-row-unread" : undefined}>
      <td>{(rowOffset + index + 1).toLocaleString("fa-IR")}</td>
      <td><Link className="ticket-title-link" href={`/${role === "agent" ? "support" : "client"}/tickets/${item.id}`}>{unread && <span className="ticket-unread-indicator" title="پیام خوانده‌نشده"><span className="sr-only">پیام خوانده‌نشده: </span></span>}<span>{item.title}</span></Link></td>
      {role === "agent" && <td>{item.owner.displayName}</td>}
      {role === "client" && <td>{item.assignedTo?.displayName || "در انتظار پذیرش"}</td>}
      {role === "agent" && <td><span className={`priority-label priority-${item.priority ?? "unset"}`}>{item.priority ? priorityLabels[item.priority] : "تعیین نشده"}</span></td>}
      <td><span className={`status-label status-${item.status}`}>{statusLabels[item.status]}</span></td>
      <td><time dateTime={item.updatedAt ?? item.createdAt}>{ticketDate(item.updatedAt ?? item.createdAt)}</time></td>
    </tr>; })}</tbody>
  </table></div>;
}
export function TicketDashboard({ role }: { role: UserRole }) {
  const { user } = useAuth();
  const userId = user?.id;
  const loader = useCallback(async (signal: AbortSignal) => {
    if (!userId) throw new TicketApiError("حساب کاربری معتبر نیست.", 401);
    const [summary, recent] = await Promise.all([getTicketSummary(signal), listTickets({ page: 1, perPage: 5 }, signal)]);
    return { summary, recent };
  }, [userId]);
  const resource = useTicketData(loader);
  useTicketListUpdates(resource.reload);
  const isAgent = role === "agent";
  return <>
    <div className="page-heading"><div><p className="eyebrow">{isAgent ? "فضای پشتیبانی" : "فضای مشتری"}</p><h1>{isAgent ? "نمای کلی" : "درخواست‌های شما"}</h1></div>
      {!isAgent && canCreateTicket(user) && <Link className="primary-button compact-button" href="/client/tickets/new">ثبت درخواست جدید</Link>}
    </div>
    <section className="welcome-band"><div><span className="band-overline">TICKETINO / {isAgent ? "SUPPORT" : "CLIENT"}</span><h2>{isAgent ? "همه درخواست‌ها، در یک نگاه." : "به فضای پشتیبانی خود خوش آمدید."}</h2><p>{isAgent ? "درخواست‌های مشتریان و گفت‌وگوهای پشتیبانی را از اینجا پیگیری کنید." : "درخواست‌های خود را ثبت کنید و گفت‌وگوها را از همین‌جا ادامه دهید."}</p></div></section>
    <Feedback {...resource} retry={resource.reload} />
    {resource.data && <>
      <div className="ticket-statistics">{([
        ["total", "همه درخواست‌ها", ""], ["open", "باز", "Open"], ["inProgress", "در جریان", "InProgress"], ["answered", "پاسخ داده شده", "Answered"], ["closed", "بسته", "Closed"],
      ] as const).map(([key, label, status]) => <Link className="ticket-stat" key={key} href={isAgent && status === "Open" ? "/support/tickets?scope=unassigned" : `/${isAgent ? "support" : "client"}/tickets${status ? `?status=${status}` : ""}`}><span>{label}</span><strong>{resource.data!.summary[key].toLocaleString("fa-IR")}</strong></Link>)}</div>
      <div className="ticket-section-heading"><h2>آخرین درخواست‌ها</h2></div>
      <TicketTable items={resource.data.recent.items} role={role} />
      <div className="ticket-list-footer"><Link className="text-link" href={`/${isAgent ? "support" : "client"}/tickets`}>مشاهده همه</Link></div>
    </>}
  </>;
}
export function TicketList({ role, scope = "all", initialStatus }: { role: UserRole; scope?: string; initialStatus?: string | string[] }) {
  const { user } = useAuth();
  const status = typeof initialStatus === "string" && Object.hasOwn(statusLabels, initialStatus) &&
    !(role === "agent" && scope === "assigned" && initialStatus === "Open") ? initialStatus : "";
  return <TicketListContent key={`${user?.id}:${role}:${scope}:${status}`} role={role} scope={scope} initialStatus={status} allowCreate={canCreateTicket(user)} />;
}
function TicketListContent({ role, scope, initialStatus, allowCreate }: { role: UserRole; scope: string; initialStatus: string; allowCreate: boolean }) {
  const isAgent = role === "agent";
  const [filters, setFilters] = useState({ search: "", status: initialStatus, priority: "" });
  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ sortBy: TicketSortBy; sortOrder: TicketSortOrder }>({ sortBy: "UpdatedAt", sortOrder: "Desc" });
  const { search, status, priority } = filters;
  const { sortBy, sortOrder } = sort;
  const loader = useCallback((signal: AbortSignal) => listTickets({ search, status, ...(isAgent ? { priority } : {}), sortBy, sortOrder, page, scope }, signal), [search, status, priority, sortBy, sortOrder, page, scope, isAgent]);
  const resource = useTicketData(loader);
  useTicketListUpdates(resource.reload);
  const heading = !isAgent ? "درخواست‌های من" : scope === "unassigned" ? "درخواست‌های بدون مسئول" : scope === "assigned" ? "درخواست‌های من" : "همه درخواست‌ها";
  const pagination = resource.data?.pagination;
  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{isAgent ? "مدیریت درخواست‌ها" : "پیگیری پشتیبانی"}</p><h1>{heading}</h1></div>
      <div className="ticket-heading-actions">
        <Link className="primary-button compact-button ticket-back-button" href={`/${isAgent ? "support" : "client"}/dashboard`}><span aria-hidden="true">→</span>بازگشت به داشبورد</Link>
        {!isAgent && allowCreate && <Link className="primary-button compact-button" href="/client/tickets/new">ثبت درخواست جدید</Link>}
      </div>
    </div>
    {isAgent && <nav className="ticket-tabs" aria-label="دسته‌بندی درخواست‌ها">
      {[["assigned", "درخواست‌های من", "/support/tickets"], ["unassigned", "بدون مسئول", "/support/tickets?scope=unassigned"]].map(([value, label, href]) => <Link key={value} className={`ticket-tab${scope === value ? " selected" : ""}`} href={href} aria-current={scope === value ? "page" : undefined}>{label}</Link>)}
    </nav>}
    <form className="ticket-filters" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
      <label>جست‌وجو<input name="search" value={draft.search} maxLength={200} placeholder={isAgent ? "موضوع یا متن درخواست" : "موضوع یا نام پشتیبان"} onChange={e => setDraft({ ...draft, search: e.target.value })} /></label>
      <label>وضعیت<select name="status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">همه وضعیت‌ها</option>{Object.entries(statusLabels).filter(([value]) => !(isAgent && scope === "assigned" && value === "Open")).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {isAgent && <label>اولویت<select name="priority" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}><option value="">همه اولویت‌ها</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button className="primary-button compact-button" type="submit" disabled={resource.loading}>اعمال فیلتر</button>
      <button className="text-link inline-retry" type="button" onClick={() => { const empty = { search: "", status: "", priority: "" }; setDraft(empty); setFilters(empty); setSort({ sortBy: "UpdatedAt", sortOrder: "Desc" }); setPage(1); }}>پاک کردن</button>
    </form>
    <div className="ticket-sort-toolbar" aria-label="مرتب‌سازی درخواست‌ها">
      <label>مرتب‌سازی بر اساس<select name="sortBy" aria-label="مرتب‌سازی بر اساس" value={sortBy} onChange={event => { setSort(current => ({ ...current, sortBy: event.target.value as TicketSortBy })); setPage(1); }}><option value="UpdatedAt">آخرین به‌روزرسانی</option>{isAgent && <option value="Priority">اولویت</option>}</select></label>
      <label>ترتیب<select name="sortOrder" aria-label="ترتیب" value={sortOrder} onChange={event => { setSort(current => ({ ...current, sortOrder: event.target.value as TicketSortOrder })); setPage(1); }}><option value="Desc">{sortBy === "Priority" ? "اولویت زیاد به کم" : "جدیدترین به قدیمی‌ترین"}</option><option value="Asc">{sortBy === "Priority" ? "اولویت کم به زیاد" : "قدیمی‌ترین به جدیدترین"}</option></select></label>
    </div>
    <Feedback {...resource} retry={resource.reload} />
    {resource.data && <TicketTable items={resource.data.items} role={role} rowOffset={(resource.data.pagination.page - 1) * resource.data.pagination.perPage} />}
    {pagination && <div className="ticket-pagination" aria-label="صفحه‌بندی"><span>{pagination.totalItems.toLocaleString("fa-IR")} درخواست</span><div>
      <button type="button" disabled={page <= 1 || resource.loading} onClick={() => setPage(value => value - 1)}>قبلی</button>
      <span>صفحه {page.toLocaleString("fa-IR")} از {Math.max(1, pagination.totalPages).toLocaleString("fa-IR")}</span>
      <button type="button" disabled={page >= pagination.totalPages || resource.loading} onClick={() => setPage(value => value + 1)}>بعدی</button>
    </div></div>}
  </>;
}
export function NewTicketView() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    if (!canCreateTicket(user)) { setError("اجازه ثبت درخواست ندارید."); return; }
    const fields: Record<string, string> = {};
    if (title.trim().length < 3 || title.trim().length > 200) fields.title = "موضوع باید ۳ تا ۲۰۰ نویسه باشد.";
    if (description.trim().length < 3 || description.trim().length > 4000) fields.description = "شرح درخواست باید ۳ تا ۴۰۰۰ نویسه باشد.";
    setErrors(fields); setError("");
    const invalid = Object.keys(fields)[0];
    if (invalid) { (event.currentTarget.elements.namedItem(invalid) as HTMLElement | null)?.focus(); return; }
    submitting.current = true; setPending(true);
    try {
      const ticket = await createTicket({ title: title.trim(), description: description.trim(), files });
      router.replace(`/client/tickets/${ticket.id}`);
    } catch (error) { setError(ticketErrorMessage(error)); }
    finally { submitting.current = false; setPending(false); }
  }
  if (!canCreateTicket(user)) return <p className="notice error-notice" role="alert">اجازه ثبت درخواست ندارید.</p>;
  return <div className="new-ticket-page">
    <div className="new-ticket-heading">
      <Link className="new-ticket-back" href="/client/tickets"><ChatIcon name="back" size={16} />درخواست‌های من</Link>
      <h1>ثبت درخواست جدید</h1>
      <p>درخواستتان را بنویسید؛ از همین‌جا همراهتان هستیم.</p>
    </div>
    <form className="new-ticket-form" onSubmit={submit} noValidate aria-busy={pending}>
      <header className="new-ticket-card-heading"><span className="new-ticket-symbol"><ChatIcon name="file" size={24} /></span><div><h2>جزئیات درخواست</h2><p>با یک موضوع کوتاه و توضیح روشن شروع کنید.</p></div></header>
      {error && <div className="new-ticket-api-error" role="alert">{error}</div>}
      <div className="new-ticket-body">
        <div className="new-ticket-fields">
          <div className="new-ticket-field">
            <div className="new-ticket-label"><label htmlFor="ticket-title">موضوع</label><span aria-hidden="true">{title.length.toLocaleString("fa-IR")} / ۲۰۰</span></div>
            <input id="ticket-title" name="title" value={title} onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(current => ({ ...current, title: "" })); }} placeholder="مثلاً: مشکل در پرداخت سفارش" maxLength={200} required disabled={pending} aria-invalid={!!errors.title} aria-describedby={`ticket-title-hint${errors.title ? " title-error" : ""}`} />
            <p className="new-ticket-hint" id="ticket-title-hint">موضوعی بنویسید که درخواستتان را در یک جمله مشخص کند.</p>
            {errors.title && <p className="field-error" id="title-error" role="alert">{errors.title}</p>}
          </div>
          <div className="new-ticket-field">
            <div className="new-ticket-label"><label htmlFor="ticket-description">پیام</label><span aria-hidden="true">{description.length.toLocaleString("fa-IR")} / ۴٬۰۰۰</span></div>
            <textarea id="ticket-description" name="description" value={description} onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(current => ({ ...current, description: "" })); }} placeholder="چه اتفاقی افتاده و چه کمکی از ما می‌خواهید؟ جزئیات مرتبط را اینجا بنویسید…" rows={7} maxLength={4000} required disabled={pending} aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} />
            {errors.description && <p className="field-error" id="description-error" role="alert">{errors.description}</p>}
          </div>
          <TicketMediaPicker disabled={pending} onChange={setFiles} />
        </div>
        <aside className="new-ticket-guide" aria-label="راهنمای ثبت درخواست">
          <span className="new-ticket-guide-icon"><ChatIcon name="checks" size={22} /></span>
          <h3>برای پاسخ دقیق‌تر</h3>
          <p>چند جزئیات کوچک کمک می‌کند زودتر به نتیجه برسیم.</p>
          <ul><li>مشکل از چه زمانی شروع شده؟</li><li>چه کاری انجام دادید و چه نتیجه‌ای گرفتید؟</li><li>اگر خطایی می‌بینید، متن آن را بنویسید.</li></ul>
          <div className="new-ticket-guide-note"><ChatIcon name="file" size={16} /><span>پس از ثبت هم می‌توانید جزئیات بیشتری در گفت‌وگو اضافه کنید.</span></div>
        </aside>
      </div>
      <footer className="new-ticket-footer">
        <p><ChatIcon name="clock" size={17} /><span>پس از ثبت، گفت‌وگو با پشتیبانی باز می‌شود.</span></p>
        <div className="new-ticket-actions">
          <Link className="new-ticket-cancel" href="/client/tickets" aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>انصراف</Link>
          <button className="new-ticket-submit" type="submit" disabled={pending}>{pending ? <span className="chat-spinner" /> : <ChatIcon name="send" size={18} />}{pending ? "در حال ثبت…" : "ثبت درخواست"}</button>
        </div>
      </footer>
    </form>
  </div>;
}
export function TicketDetail({ role, ticketId, supportActions }: { role: UserRole; ticketId: string; supportActions?: ReactNode }) {
  const { user } = useAuth();
  return <TicketChatContainer key={`${user?.id}:${role}:${ticketId}`} role={role} ticketId={ticketId} supportActions={supportActions} />;
}
