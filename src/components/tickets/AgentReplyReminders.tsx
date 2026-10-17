"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dismissReplyReminder, getReplyReminders, TicketApiError, type ReplyReminder } from "@/lib/tickets";
import { useTicketRealtime } from "./TicketRealtime";

export function AgentReplyReminders({ userId }: { userId: number }) {
  const pathname = usePathname();
  const { subscribe } = useTicketRealtime();
  const [items, setItems] = useState<ReplyReminder[]>([]);
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false, running = false, queued = false, version = 0;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function refresh() {
      if (disposed || document.hidden) return;
      if (running) { queued = true; return; }
      running = true;
      const currentVersion = version;
      request = new AbortController();
      try {
        const reminders = await getReplyReminders(request.signal);
        if (!disposed && currentVersion === version) setItems(reminders.filter(reminder => !dismissed.current.has(reminder.notificationId)));
      } catch { /* Preserve alerts during a temporary outage; reconnect/focus will retry. */ }
      finally { running = false; if (queued && !disposed) { queued = false; void refresh(); } }
    }
    function invalidate() {
      version++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 50);
    }
    const unsubscribe = subscribe(event => {
      if (event.type === "ticket") {
        if (event.data.status !== "InProgress" || event.data.assignedToId !== userId)
          setItems(current => current.filter(reminder => reminder.ticketId !== event.data.id));
        invalidate();
      } else if (event.type === "access" || event.type === "deleted") {
        setItems(current => current.filter(reminder => reminder.ticketId !== event.data.ticketId)); invalidate();
      } else if (event.type === "message" && event.data.author.id === userId) {
        setItems(current => current.filter(reminder => reminder.ticketId !== event.data.ticketId)); invalidate();
      } else if (event.type === "reminders" || event.type === "connected") invalidate();
    });
    timer = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      disposed = true; request?.abort(); if (timer) clearTimeout(timer); clearInterval(interval); unsubscribe();
      window.removeEventListener("focus", invalidate); document.removeEventListener("visibilitychange", invalidate);
    };
  }, [subscribe, userId]);

  async function close(reminder: ReplyReminder) {
    if (closing) return;
    setClosing(reminder.notificationId); setError("");
    try {
      await dismissReplyReminder(reminder);
      dismissed.current.add(reminder.notificationId);
      setItems(current => current.filter(item => item.notificationId !== reminder.notificationId));
    } catch (error) {
      if (error instanceof TicketApiError && [403, 404, 409].includes(error.status))
        setItems(current => current.filter(item => item.notificationId !== reminder.notificationId));
      else setError("بستن یادآوری انجام نشد؛ دوباره تلاش کنید.");
    } finally { setClosing(null); }
  }

  const visibleItems = items.filter(reminder => pathname !== `/support/tickets/${reminder.ticketId}`);
  if (!visibleItems.length) return null;
  return <aside className="agent-reply-reminders" aria-label="یادآوری پاسخ‌گویی" aria-live="polite" aria-relevant="additions">
    {visibleItems.map(reminder => <article className="reply-reminder-card" key={reminder.notificationId}>
      <button className="reply-reminder-close" type="button" disabled={!!closing} onClick={() => void close(reminder)} aria-label={`بستن یادآوری ${reminder.title}`} title="پنج دقیقه بعد یادآوری کن">×</button>
      <strong>این درخواست منتظر پاسخ شماست</strong>
      <p>پیام مشتری را دیده‌ای، اما هنوز پاسخی نداده‌ای.</p>
      <Link href={`/support/tickets/${reminder.ticketId}`}>{reminder.title}<span>{reminder.customerName} · مشاهده گفت‌وگو ←</span></Link>
      <small>اگر پاسخی ندهید، پنج دقیقه دیگر دوباره یادآوری می‌شود.</small>
    </article>)}
    {error && <p className="reply-reminder-error" role="alert">{error}</p>}
  </aside>;
}
