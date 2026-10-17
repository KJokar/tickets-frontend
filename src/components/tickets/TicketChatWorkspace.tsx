"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { priorityLabels, statusLabels, ticketDate, type ChatMessage, type Conversation, type TicketTitle, type Ticket, type TicketPriority } from "@/lib/tickets";
import type { UserRole } from "@/lib/auth";
import { ChatIcon } from "./ChatIcon";
import { ChatComposer } from "./ChatComposer";
import { MessageMedia } from "./MessageMedia";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { MessageEditControls, TicketEditControls, type ContentAction } from "./ChatEditControls";
import { TicketHandoffControls } from "./TicketHandoffControls";

export type ChatAction = "reply" | "close" | "accept" | "priority";
export type HandoffAction = "transfer" | "release";
type Props = {
  ticket: Ticket; conversation: Conversation | null; role: UserRole; userId: number;
  body: string; onBody: (value: string) => void; onAction: (action: ChatAction, priority?: TicketPriority) => void;
  onReply: (files: File[]) => Promise<boolean>;
  onHandoff: (agentId?: number) => Promise<boolean>;
  onRefresh: () => void; onTyping: (typing: boolean) => void; onRead: (messageId: number, version?: number) => void;
  onEditMessage: (id: number, body: string) => Promise<boolean>; onDeleteMessage: (id: number) => Promise<boolean>;
  onEditTicket: (values: TicketTitle) => Promise<boolean>; onDeleteTicket: () => Promise<boolean>;
  canAccept: boolean; canReply: boolean; canClose: boolean; canPriority: boolean;
  pending: ChatAction | HandoffAction | ContentAction | null; loading: boolean; error: string; success: string;
  peerPresence: "online" | "offline" | "unknown"; peerTyping: boolean; supportActions?: ReactNode;
};
function time(value: string) { return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function day(value: string) { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join(""); }
const emptyMessages: ChatMessage[] = [];

export function TicketChatWorkspace(props: Props) {
  const { ticket, conversation, role, userId, body, onBody, onAction, onRefresh, onTyping, onRead, canAccept, canReply, canClose, canPriority, pending, loading, error, success, peerPresence, peerTyping, supportActions } = props;
  const [acceptPriority, setAcceptPriority] = useState<TicketPriority>("Medium");
  const [confirmClose, setConfirmClose] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(true);
  const previousLastMessage = useRef<number | undefined>(undefined);
  const nearBottom = useRef(true);
  const closeTrigger = useRef<HTMLButtonElement>(null);
  const counterpart = role === "agent" ? ticket.owner : conversation?.agent ?? ticket.assignedTo;
  const name = counterpart?.displayName || "تیم پشتیبانی";
  const presenceLabel = peerPresence === "online" ? "آنلاین" : peerPresence === "offline" ? "آفلاین" : "وضعیت اتصال نامشخص";
  const messages = useMemo(() => (conversation?.messages ?? emptyMessages).filter(message => !message.deletedAt), [conversation?.messages]);
  const lastMessage = messages.at(-1);
  const busy = !!pending || loading;
  const selectedPriority = canAccept ? acceptPriority : ticket.priority ?? "Medium";
  const ownDescription = ticket.createdById === userId;
  const canEditTicket = role === "client" && ownDescription && ticket.status === "Open" && !ticket.assignedToId && !ticket.acceptedAt;

  useEffect(() => {
    const container = thread.current;
    if (!container) return;
    const ownNewMessage = lastMessage?.id !== previousLastMessage.current && lastMessage?.author.id === userId;
    if (initialScroll.current || nearBottom.current || ownNewMessage) {
      container.scrollTop = container.scrollHeight;
      initialScroll.current = false;
    }
    previousLastMessage.current = lastMessage?.id;
  }, [lastMessage?.id, lastMessage?.author.id, userId, peerTyping]);

  useEffect(() => {
    const container = thread.current;
    if (!container || !conversation) return;
    const visible = new Set<number>();
    const acknowledge = () => {
      if (document.hidden || !document.hasFocus() || !visible.size) return;
      for (const id of visible) onRead(id, messages.find(message => message.id === id)?.version);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = Number((entry.target as HTMLElement).dataset.messageId);
        if (entry.isIntersecting && entry.intersectionRatio > 0) visible.add(id); else visible.delete(id);
      }
      acknowledge();
    }, { root: container, threshold: 0, rootMargin: "-8px 0px" });
    // Each recipient advances their own inbox, even if another agent saw this message in the queue.
    container.querySelectorAll<HTMLElement>('[data-message-id][data-incoming="true"]').forEach(element => observer.observe(element));
    window.addEventListener("focus", acknowledge); document.addEventListener("visibilitychange", acknowledge);
    container.addEventListener("scroll", acknowledge);
    return () => { observer.disconnect(); window.removeEventListener("focus", acknowledge); document.removeEventListener("visibilitychange", acknowledge); container.removeEventListener("scroll", acknowledge); };
  }, [messages, conversation, onRead]);

  function scrollToBottom() { const element = thread.current; if (element) element.scrollTop = element.scrollHeight; }
  function cancelClose() { setConfirmClose(false); closeTrigger.current?.focus(); }
  return <section className="chat-workspace" aria-label="گفت‌وگوی درخواست">
    <header className="chat-header">
      <div className="chat-header-main">
        <Link className="chat-icon-button chat-back" href={`/${role === "agent" ? "support" : "client"}/tickets`} aria-label="بازگشت به فهرست درخواست‌ها" title="بازگشت به فهرست"><ChatIcon name="back" /></Link>
        <UserAvatar className={`chat-avatar ${role === "agent" ? "client-avatar" : "support-avatar"}`} url={counterpart?.avatarUrl} name={initials(name)} />
        <div className="chat-heading-copy">
          <div className="chat-contact-line"><h2>{name}</h2>{counterpart && <span className={`chat-connection-dot presence-${peerPresence}`} title={presenceLabel} aria-label={presenceLabel} role="status" />}</div>
          <p className="chat-person-caption">{role === "agent" ? "مشتری" : counterpart ? "پشتیبان درخواست شما" : "در انتظار پذیرش پشتیبان"}{peerTyping && ticket.status !== "Closed" && <span className="chat-typing-caption"> · در حال نوشتن…</span>}</p>
        </div>
        <span className={`status-label status-${ticket.status} chat-header-status`}>{statusLabels[ticket.status]}</span>
        <button className={`chat-icon-button${loading ? " is-waiting" : ""}`} type="button" aria-label="به‌روزرسانی گفت‌وگو" title="به‌روزرسانی گفت‌وگو" disabled={busy} onClick={onRefresh}><ChatIcon name="refresh" size={18} /></button>
      </div>
      <div className="chat-subject-line"><span>موضوع درخواست</span><h1>{ticket.title}</h1></div>
      {canEditTicket && <TicketEditControls title={ticket.title} busy={busy} onEdit={props.onEditTicket} onDelete={props.onDeleteTicket} />}
      {(canAccept || canPriority || canClose) && <div className="chat-management-bar">
        {(canAccept || canPriority) && <div className="chat-priority-control"><span className="chat-control-label">اولویت</span>
          <div className="chat-priority-options" role="group" aria-label={canAccept ? "اولویت هنگام پذیرش" : "تغییر اولویت"}>{Object.entries(priorityLabels).map(([value, label]) => <button className={`chat-priority-option option-${value}${selectedPriority === value ? " selected" : ""}`} aria-pressed={selectedPriority === value} key={value} type="button" disabled={busy} onClick={() => canAccept ? setAcceptPriority(value as TicketPriority) : onAction("priority", value as TicketPriority)}><i aria-hidden="true" />{label}</button>)}</div>
          {pending === "priority" && <span className="chat-inline-status" role="status"><span className="chat-spinner" />ذخیره…</span>}
        </div>}
        {canAccept && <button className="chat-accept-button" type="button" onClick={() => onAction("accept", acceptPriority)} disabled={busy}><ChatIcon name="check" size={17} />{pending === "accept" ? "در حال پذیرش…" : "پذیرش و شروع گفت‌وگو"}</button>}
        {canClose && <TicketHandoffControls ticketId={ticket.id} busy={busy} pending={pending === "transfer" || pending === "release"} error={error} onHandoff={props.onHandoff} />}
        {canClose && <div className="chat-close-control" onKeyDown={event => { if (event.key === "Escape") cancelClose(); }}>
          <button ref={closeTrigger} className="chat-end-button" type="button" onClick={() => setConfirmClose(value => !value)} disabled={busy} aria-expanded={confirmClose}><ChatIcon name="close" size={16} />بستن گفت‌وگو</button>
          {confirmClose && <div className="chat-close-popover" role="dialog" aria-label="تأیید بستن گفت‌وگو"><strong>گفت‌وگو پایان پیدا کند؟</strong><p>پیام‌ها باقی می‌مانند و ارسال پیام جدید متوقف می‌شود.</p><div><button type="button" className="chat-cancel-button" onClick={cancelClose}>انصراف</button><button className="chat-confirm-close" type="button" disabled={busy} onClick={() => { setConfirmClose(false); onAction("close"); }}>بستن درخواست</button></div></div>}
        </div>}
      </div>}
      {success && <div className="chat-action-note" role="status"><ChatIcon name="check" size={13} />{success}</div>}
      {error && <div className="chat-error-note" role="alert"><span>{error}</span><button type="button" onClick={onRefresh} disabled={busy}>تلاش دوباره</button></div>}
    </header>
    {role === "agent" && supportActions}
    <div className="chat-thread-wrap">
      <div className="chat-message-list" ref={thread} aria-label="پیام‌های گفت‌وگو" onScroll={event => { const element = event.currentTarget; const away = element.scrollHeight - element.scrollTop - element.clientHeight > 120; nearBottom.current = !away; setAwayFromBottom(away); }}>
        <div className="chat-date-divider"><span>{day(ticket.createdAt)}</span></div>
        {messages.map((message, index) => {
          const own = message.author.id === userId;
          const seen = own && !!message.isRead;
          const previousDate = index ? messages[index - 1].createdAt : ticket.createdAt;
          return <div className="chat-message-entry" key={message.id}>
            {day(message.createdAt) !== day(previousDate) && <div className="chat-date-divider"><span>{day(message.createdAt)}</span></div>}
            <article className={`chat-bubble ${own ? "chat-bubble-own" : "chat-bubble-peer"}`} data-message-id={message.id} data-incoming={!own} data-read={!!message.isRead}>
              {!own && <span className="chat-bubble-author">{message.author.displayName}</span>}
              <p dir="auto">{message.body}</p>
              <MessageMedia ticketId={ticket.id} messageId={message.id} files={message.attachments} />
              {message.editedAt && <span className="chat-edited-label">ویرایش‌شده</span>}
              {own && !seen && <MessageEditControls body={message.body} busy={busy} onEdit={text => props.onEditMessage(message.id, text)} onDelete={() => props.onDeleteMessage(message.id)} />}
              <footer><time dateTime={message.createdAt} title={ticketDate(message.createdAt)}>{time(message.createdAt)}</time>{own && <span className={`chat-receipt${seen ? " is-read" : ""}`} aria-label={seen ? "دیده شده" : "ارسال شده"} title={seen ? "دیده شده" : "ارسال شده"}><ChatIcon name={seen ? "checks" : "check"} size={17} /></span>}</footer>
            </article>
          </div>;
        })}
        {peerTyping && ticket.status !== "Closed" && <div className="chat-typing-bubble" role="status" aria-label={`${name} در حال نوشتن است`}><span /><span /><span /></div>}
        {!messages.length && conversation && <p className="chat-conversation-start"><ChatIcon name="shield" size={13} />شروع گفت‌وگو با {name}</p>}
      </div>
      {awayFromBottom && <button className="chat-scroll-latest" type="button" onClick={scrollToBottom} aria-label="رفتن به آخر گفت‌وگو"><ChatIcon name="down" size={17} /></button>}
    </div>
    {canReply ? <ChatComposer ticketId={ticket.id} value={body} onChange={onBody} onSend={props.onReply} sending={pending === "reply"} disabled={!!pending && pending !== "reply"} onTyping={onTyping} />
      : <div className={`chat-readonly${ticket.status === "Closed" ? " ticket-closed-note" : ""}`}><ChatIcon name={ticket.status === "Closed" ? "shield" : "clock"} size={18} /><span>{ticket.status === "Closed" ? "این گفت‌وگو بسته شده است؛ پیام‌ها برای شما باقی می‌مانند." : role === "agent" ? "برای پاسخ دادن، ابتدا درخواست را بپذیرید." : "گفت‌وگو در انتظار پذیرش پشتیبان است."}</span></div>}
  </section>;
}
