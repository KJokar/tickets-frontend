"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { UserRole } from "@/lib/auth";
import { acceptTicket, changeTicketPriority, closeTicket, deleteChatMessage, deleteTicket, editChatMessage, editTicket, getConversation, getTicket, mergeChatMessages, releaseTicket, sendChatMessage, transferTicket, ticketErrorMessage, TicketApiError, type ChatReadReceipt, type TicketTitle, type TicketPriority } from "@/lib/tickets";
import { TicketChatWorkspace, type ChatAction, type HandoffAction } from "./TicketChatWorkspace";
import { useTicketData } from "./useTicketData";
import { useTicketRealtime } from "./TicketRealtime";
import { useChatReadCursor } from "./useChatReadCursor";
import { useChatPresence } from "./useChatPresence";
import type { ContentAction } from "./ChatEditControls";
import { uploadMedia, type MediaReference } from "@/lib/media";

export function TicketChatContainer({ role, ticketId, supportActions }: { role: UserRole; ticketId: string; supportActions?: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const realtime = useTicketRealtime();
  const hasChat = !!user?.permissions.includes("tickets.chat");
  const loader = useCallback(async (signal: AbortSignal) => {
    const ticket = await getTicket(ticketId, signal);
    const conversation = hasChat ? await getConversation(ticket.id, signal) : null;
    return { ticket, conversation };
  }, [ticketId, hasChat]);
  const resource = useTicketData(loader);
  const { reload, update, data } = resource;
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<ChatAction | HandoffAction | ContentAction | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const typingExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitting = useRef(false);
  const messageAttempt = useRef<{ body: string; id: string; files: File[]; attachments?: MediaReference[] } | null>(null);
  const ticket = data?.ticket;
  const conversation = data?.conversation ?? null;
  const peerPresence = useChatPresence(Number(ticketId), role === "agent" ? ticket?.createdById : ticket?.assignedToId);
  const userId = user?.id ?? 0;
  const assigned = role === "agent" && ticket?.assignedToId === userId;
  const canAccept = !!(role === "agent" && ticket?.status === "Open" && !ticket.assignedToId && user?.permissions.includes("tickets.accept"));
  const canClose = !!(assigned && ticket?.status !== "Closed" && ticket?.acceptedAt && user?.permissions.includes("tickets.status.change"));
  const canPriority = !!(assigned && ticket?.status !== "Closed" && user?.permissions.includes("tickets.priority.change"));
  const canReply = !!(ticket && conversation && ticket.status !== "Closed" && hasChat && (assigned || role === "client" && ticket.createdById === userId));
  const { subscribe, markRead, typing, state: connection } = realtime;

  useEffect(() => {
    const unsubscribe = subscribe(event => {
      if (event.type === "connected") { reload(); return; }
      if (event.type === "presence" || event.type === "reminders") return;
      if (event.type === "queue") { if (role === "agent" && !data?.ticket.assignedToId) reload(); return; }
      if ((event.type === "ticket" ? event.data.id : event.data.ticketId) !== Number(ticketId)) return;
      if (event.type === "access") {
        update(() => null); setBody(""); messageAttempt.current = null; setPeerTyping(false);
        router.replace("/support/tickets"); return;
      }
      if (event.type === "deleted") { router.replace("/client/tickets"); return; }
      if (event.type === "typing") {
        if (event.data.userId === userId) return;
        if (typingExpiry.current) clearTimeout(typingExpiry.current);
        const milliseconds = Math.min(5000, Date.parse(event.data.expiresAt) - Date.now());
        setPeerTyping(event.data.isTyping && milliseconds > 0);
        if (event.data.isTyping) typingExpiry.current = setTimeout(() => setPeerTyping(false), Math.max(0, milliseconds));
      } else if (event.type === "message") {
        if (event.data.author.id !== userId) setPeerTyping(false);
        if (!data?.conversation) { reload(); return; }
        const message = event.data;
        update(current => !current?.conversation ? current : { ...current, conversation: { ...current.conversation, messages: mergeChatMessages(current.conversation.messages, [message]) } });
      } else if (event.type === "ticket") {
        const changed = event.data;
        const assignmentChanged = changed.assignedToId !== data?.ticket.assignedToId;
        if (changed.status === "Closed" || assignmentChanged) setPeerTyping(false);
        if (!data?.conversation) { reload(); return; }
        update(current => !current || Date.parse(changed.updatedAt ?? changed.createdAt) < Date.parse(current.ticket.updatedAt ?? current.ticket.createdAt) ? current : { ticket: changed, conversation: current.conversation ? { ...current.conversation, agent: changed.assignedTo ?? null } : null });
        if (assignmentChanged) reload();
      } else if (event.type === "read") {
        if (!data) return;
        const receipt = event.data;
        update(current => !current?.conversation ? current : { ...current, conversation: { ...current.conversation,
          ...(receipt.userId === userId ? { lastReadMessageId: Math.max(current.conversation.lastReadMessageId ?? 0, receipt.lastReadMessageId) } : { peerLastReadMessageId: Math.max(current.conversation.peerLastReadMessageId ?? 0, receipt.lastReadMessageId) }),
          messages: current.conversation.messages.map(message => message.author.id !== receipt.userId && message.id === receipt.messageId ? { ...message, isRead: true } : message),
        } });
      }
    });
    return unsubscribe;
  }, [subscribe, reload, update, ticketId, userId, data, role, router]);
  useEffect(() => () => { if (typingExpiry.current) clearTimeout(typingExpiry.current); }, []);

  useEffect(() => {
    if (connection === "connected") return;
    const refresh = () => { if (!document.hidden && !submitting.current) reload(); };
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [connection, reload]);
  useEffect(() => { if (!success) return; const timer = setTimeout(() => setSuccess(""), 2400); return () => clearTimeout(timer); }, [success]);

  const onReadReceipt = useCallback((receipt: ChatReadReceipt) => {
    update(current => !current?.conversation ? current : { ...current, conversation: { ...current.conversation,
      lastReadMessageId: Math.max(current.conversation.lastReadMessageId ?? 0, receipt.lastReadMessageId),
      messages: current.conversation.messages.map(message => message.id === receipt.messageId && message.author.id !== receipt.userId ? { ...message, isRead: true } : message),
    } });
  }, [update]);
  const onRead = useChatReadCursor(Number(ticketId), !!conversation, markRead, onReadReceipt);
  const onTyping = useCallback((value: boolean) => { if (canReply && conversation?.agent) typing(Number(ticketId), value); }, [canReply, conversation?.agent, typing, ticketId]);

  async function mutate(kind: ChatAction, priority: TicketPriority = ticket?.priority ?? "Medium", files: File[] = []): Promise<boolean> {
    if (!ticket || submitting.current) return false;
    setError(""); setSuccess("");
    if (kind === "reply" && !canReply || kind === "accept" && !canAccept || kind === "close" && !canClose || kind === "priority" && !canPriority) { setError("اجازه انجام این کار را ندارید."); return false; }
    if (kind === "reply" && (!body.trim() && !files.length || body.trim().length > 4000)) { setError("پیام یا فایل انتخاب کنید؛ متن باید حداکثر ۴۰۰۰ نویسه باشد."); return false; }
    submitting.current = true; setPending(kind);
    try {
      if (kind === "reply") {
        const text = body.trim();
        if (messageAttempt.current?.body !== text || messageAttempt.current.files.length !== files.length || files.some((file, index) => messageAttempt.current?.files[index] !== file)) messageAttempt.current = { body: text, id: crypto.randomUUID(), files };
        typing(ticket.id, false);
        if (!messageAttempt.current.attachments) messageAttempt.current.attachments = await uploadMedia(files, "MessageAttachment", ticket.id);
        const message = await sendChatMessage(ticket.id, text, messageAttempt.current.id, messageAttempt.current.attachments);
        update(current => !current?.conversation ? current : { ...current, conversation: { ...current.conversation, messages: mergeChatMessages(current.conversation.messages, [message]) } });
        messageAttempt.current = null; setBody("");
      } else {
        const changed = kind === "accept" ? await acceptTicket(ticket.id, priority) : kind === "priority" ? await changeTicketPriority(ticket.id, priority) : await closeTicket(ticket.id);
        update(current => ({ ticket: current && Date.parse(changed.updatedAt ?? changed.createdAt) < Date.parse(current.ticket.updatedAt ?? current.ticket.createdAt) ? current.ticket : changed, conversation: current?.conversation ?? null }));
        setSuccess(kind === "accept" ? "گفت‌وگو آماده است" : kind === "priority" ? "اولویت ذخیره شد" : "گفت‌وگو بسته شد");
      }
      if (connection !== "connected" || kind === "accept") reload();
      return true;
    } catch (error) {
      setError(ticketErrorMessage(error));
      if (error instanceof TicketApiError && [403, 404, 409].includes(error.status)) reload();
      return false;
    } finally { submitting.current = false; setPending(null); }
  }

  async function changeContent(kind: "editMessage" | "deleteMessage" | "editTicket" | "deleteTicket", messageId?: number, values?: string | TicketTitle): Promise<boolean> {
    if (!ticket || submitting.current) return false;
    const message = conversation?.messages.find(item => item.id === messageId);
    const allowed = kind === "editTicket" || kind === "deleteTicket"
      ? role === "client" && ticket.createdById === userId && ticket.status === "Open" && !ticket.assignedToId && !ticket.acceptedAt
      : message?.author.id === userId && !message.deletedAt && !message.isRead;
    if (!allowed) { setError("این مورد دیگر قابل ویرایش یا حذف نیست."); return false; }
    submitting.current = true; setPending(kind); setError(""); setSuccess("");
    try {
      if (kind === "deleteTicket") { await deleteTicket(ticket.id); router.replace("/client/tickets"); }
      else if (kind === "editTicket") {
        const changed = await editTicket(ticket.id, values as TicketTitle);
        update(current => current ? { ...current, ticket: changed } : current);
      } else {
        const changed = kind === "editMessage" ? await editChatMessage(ticket.id, messageId!, values as string) : await deleteChatMessage(ticket.id, messageId!);
        update(current => !current?.conversation ? current : { ...current, conversation: { ...current.conversation,
          messages: mergeChatMessages(current.conversation.messages, [changed]),
        } });
      }
      setSuccess(kind.startsWith("delete") ? "حذف شد" : "ویرایش ذخیره شد");
      return true;
    } catch (error) { setError(ticketErrorMessage(error)); reload(); return false; }
    finally { submitting.current = false; setPending(null); }
  }

  async function handoff(agentId?: number): Promise<boolean> {
    if (!ticket || submitting.current || !canClose) return false;
    submitting.current = true; setPending(agentId ? "transfer" : "release"); setError(""); setSuccess("");
    try {
      typing(ticket.id, false);
      if (agentId) await transferTicket(ticket.id, agentId); else await releaseTicket(ticket.id);
      update(() => null); setBody(""); messageAttempt.current = null;
      router.replace("/support/tickets");
      return true;
    } catch (error) {
      setError(ticketErrorMessage(error));
      if (error instanceof TicketApiError && [403, 404, 409].includes(error.status)) reload();
      return false;
    } finally { submitting.current = false; setPending(null); }
  }

  if (!ticket) return <div className="chat-initial-state"><Link className="text-link" href={`/${role === "agent" ? "support" : "client"}/tickets`}>بازگشت به فهرست</Link>{resource.error ? <p className="notice error-notice" role="alert">{resource.error} <button className="text-link inline-retry" type="button" onClick={reload}>تلاش دوباره</button></p> : <p role="status">در حال آماده‌سازی گفت‌وگو…</p>}</div>;
  return <TicketChatWorkspace ticket={ticket} conversation={conversation} role={role} userId={userId} body={body} onBody={setBody} onAction={(kind, priority) => void mutate(kind, priority)}
    onReply={files => mutate("reply", undefined, files)}
    onHandoff={handoff}
    onEditMessage={(id, text) => changeContent("editMessage", id, text)} onDeleteMessage={id => changeContent("deleteMessage", id)}
    onEditTicket={values => changeContent("editTicket", undefined, values)} onDeleteTicket={() => changeContent("deleteTicket")}
    onRefresh={reload} onTyping={onTyping} onRead={onRead} canAccept={canAccept} canReply={canReply} canClose={canClose} canPriority={canPriority} pending={pending} loading={resource.loading}
    error={error || resource.error} success={success} peerPresence={peerPresence} peerTyping={peerTyping && connection === "connected"} supportActions={supportActions} />;
}
