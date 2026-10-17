import { AuthApiError, authenticatedFetch } from "./auth";

import { uploadMedia, type MediaReference } from "./media";
import { englishDigits } from "./phone";

export type TicketStatus = "Open" | "InProgress" | "Answered" | "Closed";
export type TicketPriority = "Low" | "Medium" | "High";
export const statusLabels: Record<TicketStatus, string> = { Open: "باز", InProgress: "در جریان", Answered: "پاسخ داده شده", Closed: "بسته" };
export const priorityLabels: Record<TicketPriority, string> = { Low: "کم", Medium: "متوسط", High: "زیاد" };
export type TicketAuthor = { id: number; displayName: string; role: "Client" | "Agent"; avatarUrl?: string };
export type TransferAgent = TicketAuthor & { mobile: string };
export type ReplyReminder = { ticketId: number; title: string; customerName: string; notificationId: string; raisedAt: string };
export type TicketListItem = {
  id: number; createdById: number; assignedToId?: number | null; title: string;
  status: TicketStatus; priority?: TicketPriority | null; createdAt: string;
  hasUnreadMessages?: boolean;
  updatedAt?: string; acceptedAt?: string; owner: TicketAuthor; assignedTo?: TicketAuthor | null;
};
export type Ticket = TicketListItem & { closedAt?: string };
export type MessageAttachment = { id: string; fileName: string; contentType: string; size: number; storageKey?: string };
export type ChatMessage = { id: number; ticketId: number; clientMessageId: string; body: string; createdAt: string; author: TicketAuthor; editedAt?: string; deletedAt?: string; isRead?: boolean; version?: number; attachments?: MessageAttachment[] };
export type Conversation = { ticketId: number; startedAt: string; client: TicketAuthor; agent?: TicketAuthor | null; messages: ChatMessage[]; lastReadMessageId?: number | null; peerLastReadMessageId?: number | null };
export type ChatReadReceipt = { ticketId: number; userId: number; lastReadMessageId: number; readAt: string; messageId?: number };
export type ChatTyping = { ticketId: number; userId: number; isTyping: boolean; expiresAt: string };
export type ChatPresence = { ticketId: number; userId?: number | null; isOnline: boolean };
export function validPresence(value: unknown): value is ChatPresence {
  return record(value) && Number.isSafeInteger(value.ticketId) && (value.ticketId as number) > 0 &&
    (value.userId == null || Number.isSafeInteger(value.userId) && (value.userId as number) > 0) && typeof value.isOnline === "boolean" &&
    (value.userId != null || value.isOnline === false);
}
export type TicketSummary = { total: number; open: number; inProgress: number; answered: number; closed: number };
export type TicketReport = { from: string; to: string; generatedAt: string; timeZone: string; summary: TicketSummary; dailyCreated: { date: string; count: number }[] };
export type TicketReportRow = { id: number; customerName: string; title: string };
export type TicketReportPage = { items: TicketReportRow[]; pagination: Pagination };
export type Pagination = { page: number; perPage: number; totalItems: number; totalPages: number };
export type TicketPage = { items: TicketListItem[]; pagination: Pagination };
export type TransferAgentPage = { items: TransferAgent[]; pagination: Pagination };
export type TicketSortBy = "UpdatedAt" | "Priority";
export type TicketSortOrder = "Desc" | "Asc";
export type TicketFilters = { status?: string; priority?: string; search?: string; page?: number; perPage?: number; scope?: string; sortBy?: TicketSortBy; sortOrder?: TicketSortOrder };
export type TicketTitle = { title: string };
export type NewTicket = { title: string; description: string; files?: File[] };
export class TicketApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "TicketApiError"; }
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function author(value: unknown): value is TicketAuthor { return record(value) && Number.isSafeInteger(value.id) && typeof value.displayName === "string" && (value.role === "Client" || value.role === "Agent"); }
function transferAgent(value: unknown): value is TransferAgent {
  return record(value) && typeof value.mobile === "string" && /^\+[1-9]\d{6,14}$/.test(value.mobile) &&
    author(value) && value.id > 0 && value.role === "Agent";
}
function baseTicket(value: unknown): boolean {
  return record(value) && Number.isSafeInteger(value.id) && (value.id as number) > 0 && Number.isSafeInteger(value.createdById) &&
    (value.assignedToId == null || Number.isSafeInteger(value.assignedToId)) && typeof value.title === "string" &&
    typeof value.createdAt === "string" && typeof value.status === "string" && Object.hasOwn(statusLabels, value.status) &&
    (value.hasUnreadMessages === undefined || typeof value.hasUnreadMessages === "boolean") &&
    (value.priority == null || typeof value.priority === "string" && Object.hasOwn(priorityLabels, value.priority)) &&
    author(value.owner) &&
    (value.assignedTo == null || author(value.assignedTo));
}
export function validTicket(value: unknown): value is Ticket {
  return baseTicket(value);
}
export function validMessage(value: unknown): value is ChatMessage {
  return record(value) && Number.isSafeInteger(value.id) && Number.isSafeInteger(value.ticketId) &&
    typeof value.clientMessageId === "string" && typeof value.body === "string" && typeof value.createdAt === "string" && author(value.author) &&
    (value.isRead == null || typeof value.isRead === "boolean") &&
    (value.version == null || Number.isSafeInteger(value.version) && (value.version as number) > 0) &&
    (value.attachments === undefined || Array.isArray(value.attachments) && value.attachments.every(file =>
      record(file) && typeof file.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(file.id) &&
      typeof file.fileName === "string" && typeof file.contentType === "string" && Number.isSafeInteger(file.size) && (file.size as number) > 0)) &&
    [value.editedAt, value.deletedAt].every(date => date == null || typeof date === "string" && Number.isFinite(Date.parse(date)));
}
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = messages.get(message.id);
    const latest = previous?.deletedAt ? previous : message.deletedAt ? message
      : previous && (previous.version ?? 0) > (message.version ?? 0) ? previous : message;
    messages.set(message.id, previous?.isRead || message.isRead ? { ...latest, isRead: true } : latest);
  }
  return [...messages.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
}
function invalid(): never { throw new TicketApiError("پاسخ معتبر از سرویس درخواست‌ها دریافت نشد.", 502); }
async function request(path: string, init: RequestInit = {}) {
  const response = await authenticatedFetch(`/Tickets/v1/Tickets${path}`, {
    ...init, headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = record(body) && typeof body.message === "string" && /[\u0600-\u06ff]/.test(body.message) ? body.message
      : response.status === 404 ? "درخواست پیدا نشد یا به آن دسترسی ندارید."
      : response.status === 403 ? "اجازه انجام این کار را ندارید."
      : response.status === 409 ? "وضعیت درخواست تغییر کرده است یا این عملیات مجاز نیست. دوباره درخواست را بررسی کنید."
      : response.status === 400 || response.status === 422 ? "اطلاعات فرم معتبر نیست. فیلدها را بررسی کنید."
      : response.status === 413 ? "حجم پیوست‌ها بیشتر از حد مجاز است. مجموع فایل‌ها باید حداکثر ۲۰ مگابایت باشد."
      : response.status === 429 ? "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید."
      : "سرویس درخواست‌ها در دسترس نیست. دوباره تلاش کنید.";
    throw new TicketApiError(message, response.status);
  }
  if (!record(body) || body.data == null) invalid();
  return body;
}
export function ticketErrorMessage(error: unknown): string {
  return error instanceof TicketApiError || error instanceof AuthApiError ? error.message : "دریافت اطلاعات ناموفق بود. دوباره تلاش کنید.";
}
export async function getTicketSummary(signal?: AbortSignal): Promise<TicketSummary> {
  const { data } = await request("/Dashboard", { signal });
  if (!record(data) || !["total", "open", "inProgress", "answered", "closed"].every(key => Number.isSafeInteger(data[key]) && (data[key] as number) >= 0)) invalid();
  return data as TicketSummary;
}
export async function getTicketReport(filters: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<TicketReport> {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const { data } = await request(`/Reports?${query}`, { signal });
  if (!record(data) || typeof data.from !== "string" || typeof data.to !== "string" || typeof data.generatedAt !== "string" || data.timeZone !== "Asia/Tehran" ||
    !record(data.summary) || !["total", "open", "inProgress", "answered", "closed"].every(key => Number.isSafeInteger((data.summary as Record<string, unknown>)[key]) && ((data.summary as Record<string, unknown>)[key] as number) >= 0) ||
    !Array.isArray(data.dailyCreated) || data.dailyCreated.length > 366 || !data.dailyCreated.every(day => record(day) && typeof day.date === "string" && Number.isSafeInteger(day.count) && (day.count as number) >= 0)) invalid();
  return data as TicketReport;
}
export async function getTicketReportRows(filters: { from: string; to: string; page?: number; perPage?: number }, signal?: AbortSignal): Promise<TicketReportPage> {
  const query = new URLSearchParams({ from: filters.from, to: filters.to, page: String(filters.page ?? 1), perPage: String(filters.perPage ?? 20) });
  const { data, pagination } = await request(`/Reports/Tickets?${query}`, { signal });
  if (!Array.isArray(data) || !data.every(row => record(row) && Number.isSafeInteger(row.id) && (row.id as number) > 0 && typeof row.customerName === "string" && typeof row.title === "string") ||
      !record(pagination) || !["page", "perPage", "totalItems", "totalPages"].every(key => Number.isSafeInteger(pagination[key])) ||
      (pagination.page as number) < 1 || (pagination.perPage as number) < 1 || (pagination.perPage as number) > 100 || (pagination.totalItems as number) < 0 ||
      pagination.totalPages !== Math.ceil((pagination.totalItems as number) / (pagination.perPage as number)) || data.length > (pagination.perPage as number)) invalid();
  return { items: data as TicketReportRow[], pagination: pagination as Pagination };
}
export async function getAllTicketReportRows(range: { from: string; to: string }, signal?: AbortSignal): Promise<TicketReportRow[]> {
  const rows: TicketReportRow[] = [], seen = new Set<number>();
  let page = 1, total: number | undefined;
  while (true) {
    const result = await getTicketReportRows({ ...range, page, perPage: 100 }, signal);
    total ??= result.pagination.totalItems;
    if (result.pagination.totalItems !== total || result.pagination.page !== page || result.items.some(row => seen.has(row.id)))
      throw new TicketApiError("اطلاعات گزارش تغییر کرده است. گزارش را دوباره دریافت کنید.", 409);
    for (const row of result.items) { rows.push(row); seen.add(row.id); }
    if (page >= result.pagination.totalPages) break;
    page++;
  }
  if (rows.length !== total) invalid();
  return rows;
}
export async function listTickets(filters: TicketFilters = {}, signal?: AbortSignal): Promise<TicketPage> {
  const query = new URLSearchParams({ page: String(filters.page ?? 1), perPage: String(filters.perPage ?? 20) });
  for (const key of ["status", "priority", "search", "sortBy", "sortOrder"] as const) if (filters[key]?.trim()) query.set(key, filters[key]!.trim());
  if (filters.scope === "assigned") query.set("mineOnly", "true");
  const payload = await request(`${filters.scope === "unassigned" ? "/Unassigned" : "/List"}?${query}`, { signal });
  const data = payload.data, pagination = payload.pagination;
  if (!Array.isArray(data) || !data.every(baseTicket) ||
      !record(pagination) || !["page", "perPage", "totalItems", "totalPages"].every(key => Number.isSafeInteger(pagination[key])) ||
      (pagination.page as number) < 1 || (pagination.perPage as number) < 1 || (pagination.totalPages as number) < 0 || (pagination.totalItems as number) < 0) invalid();
  return { items: data as TicketListItem[], pagination: pagination as Pagination };
}
export async function getTicket(id: string | number, signal?: AbortSignal): Promise<Ticket> {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new TicketApiError("شناسه درخواست معتبر نیست.", 404);
  const { data } = await request(`/Select/${id}`, { signal });
  if (!validTicket(data)) invalid();
  return data;
}
export async function createTicket(values: NewTicket): Promise<Ticket> {
  const { files, ...fields } = values;
  const attachments = files?.length ? await uploadMedia(files, "MessageAttachment") : [];
  const { data } = await request("/Create", { method: "POST", body: JSON.stringify({ ...fields, ...(attachments.length ? { attachments } : {}) }) });
  if (!validTicket(data)) invalid();
  return data;
}
export async function getMessageAttachment(ticketId: number, messageId: number, attachmentId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await authenticatedFetch(`/Tickets/v1/Tickets/${ticketId}/Messages/${messageId}/Attachments/${encodeURIComponent(attachmentId)}`, { signal });
  if (!response.ok) throw new TicketApiError(response.status === 404 || response.status === 403 ? "این پیوست در دسترس نیست." : "دریافت پیوست ناموفق بود. دوباره تلاش کنید.", response.status);
  return response.blob();
}
export async function acceptTicket(id: number, priority: TicketPriority): Promise<Ticket> {
  const { data } = await request(`/${id}/Accept`, { method: "POST", body: JSON.stringify({ priority }) });
  if (!validTicket(data)) invalid();
  return data;
}
export async function getTransferAgents(id: number, search = "", page = 1, signal?: AbortSignal): Promise<TransferAgentPage> {
  const query = new URLSearchParams({ page: String(page), perPage: "10" });
  if (search.trim()) query.set("search", englishDigits(search.trim()));
  const { data, pagination } = await request(`/${id}/TransferAgents?${query}`, { signal });
  if (!Array.isArray(data) || !data.every(transferAgent) ||
    !record(pagination) || !["page", "perPage", "totalItems", "totalPages"].every(key => Number.isSafeInteger(pagination[key])) ||
    (pagination.page as number) < 1 || (pagination.perPage as number) < 1 || (pagination.totalPages as number) < 0 || (pagination.totalItems as number) < 0) invalid();
  return { items: data as TransferAgent[], pagination: pagination as Pagination };
}
export async function getReplyReminders(signal?: AbortSignal): Promise<ReplyReminder[]> {
  const { data } = await request("/ReplyReminders", { signal });
  if (!Array.isArray(data) || !data.every(value => record(value) && Number.isSafeInteger(value.ticketId) && (value.ticketId as number) > 0 &&
    typeof value.title === "string" && typeof value.customerName === "string" && typeof value.notificationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.notificationId) &&
    typeof value.raisedAt === "string" && Number.isFinite(Date.parse(value.raisedAt)))) invalid();
  return data as ReplyReminder[];
}
export async function dismissReplyReminder(reminder: ReplyReminder): Promise<void> {
  const { data } = await request(`/${reminder.ticketId}/ReplyReminder/Dismiss`, { method: "POST", body: JSON.stringify({ notificationId: reminder.notificationId }) });
  if (!record(data) || data.ticketId !== reminder.ticketId || typeof data.nextReminderAt !== "string" || !Number.isFinite(Date.parse(data.nextReminderAt))) invalid();
}
export async function transferTicket(id: number, agentId: number): Promise<Ticket> {
  const { data } = await request(`/${id}/Transfer`, { method: "POST", body: JSON.stringify({ agentId }) });
  if (!validTicket(data) || data.id !== id || data.assignedToId !== agentId || data.status !== "InProgress") invalid();
  return data;
}
export async function releaseTicket(id: number): Promise<Ticket> {
  const { data } = await request(`/${id}/Release`, { method: "POST" });
  if (!validTicket(data) || data.id !== id || data.assignedToId != null || data.status !== "Open") invalid();
  return data;
}
export async function getMessageAttachmentAccess(ticketId: number, messageId: number, attachmentId: string, signal?: AbortSignal): Promise<{ url: string; expiresAt: string }> {
  const { data } = await request(`/${ticketId}/Messages/${messageId}/Attachments/${attachmentId}/Access`, { signal });
  if (!record(data) || typeof data.url !== "string" || typeof data.expiresAt !== "string") invalid();
  return data as { url: string; expiresAt: string };
}
export async function editTicket(id: number, values: TicketTitle): Promise<Ticket> {
  const { data } = await request(`/${id}`, { method: "PATCH", body: JSON.stringify(values) });
  if (!validTicket(data) || data.id !== id) invalid();
  return data;
}
export async function deleteTicket(id: number): Promise<void> {
  const { data } = await request(`/${id}`, { method: "DELETE" });
  if (!record(data) || data.ticketId !== id) invalid();
}
export async function editChatMessage(id: number, messageId: number, body: string): Promise<ChatMessage> {
  const { data } = await request(`/${id}/Messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ body }) });
  if (!validMessage(data) || data.ticketId !== id || data.id !== messageId) invalid();
  return data;
}
export async function deleteChatMessage(id: number, messageId: number): Promise<ChatMessage> {
  const { data } = await request(`/${id}/Messages/${messageId}`, { method: "DELETE" });
  if (!validMessage(data) || data.ticketId !== id || data.id !== messageId || !data.deletedAt) invalid();
  return data;
}
export async function getConversation(id: number, signal?: AbortSignal): Promise<Conversation> {
  const { data } = await request(`/${id}/Conversation?includeDeleted=true`, { signal });
  if (!record(data) || data.ticketId !== id || typeof data.startedAt !== "string" || !author(data.client) || (data.agent != null && !author(data.agent)) ||
    ![data.lastReadMessageId, data.peerLastReadMessageId].every(value => value == null || Number.isSafeInteger(value) && (value as number) > 0) ||
    !Array.isArray(data.messages) || !data.messages.every(message => validMessage(message) && message.ticketId === id)) invalid();
  return data as Conversation;
}
export async function sendChatMessage(id: number, body: string, clientMessageId: string, attachments: MediaReference[] = []): Promise<ChatMessage> {
  const send = () => request(`/${id}/Messages`, { method: "POST", body: JSON.stringify({ body, clientMessageId, ...(attachments.length ? { attachments } : {}) }) });
  let payload;
  try { payload = await send(); }
  catch (error) {
    if (!(error instanceof TicketApiError) || error.status !== 409) throw error;
    // A read cursor or another message may win the revision. Preserve the UUID
    // when retrying once, and never retry into a closed conversation.
    const ticket = await getTicket(id);
    if (ticket.status === "Closed") throw error;
    payload = await send();
  }
  const { data } = payload;
  if (!validMessage(data) || data.ticketId !== id || data.clientMessageId !== clientMessageId) invalid();
  return data;
}
export async function changeTicketPriority(id: number, priority: TicketPriority): Promise<Ticket> {
  const { data } = await request(`/${id}/Priority`, { method: "PATCH", body: JSON.stringify({ priority }) });
  if (!validTicket(data)) invalid();
  return data;
}
export async function closeTicket(id: number): Promise<Ticket> {
  const { data } = await request(`/${id}/Status`, { method: "PATCH", body: JSON.stringify({ status: "Closed" }) });
  if (!validTicket(data)) invalid();
  return data;
}
export async function markConversationRead(id: number, lastReadMessageId: number, version?: number): Promise<ChatReadReceipt> {
  const { data } = await request(`/${id}/Read`, { method: "POST", body: JSON.stringify({ lastReadMessageId, version }) });
  if (!validReadReceipt(data) || data.ticketId !== id) invalid();
  return data;
}
export function validReadReceipt(value: unknown): value is ChatReadReceipt {
  return record(value) && Number.isSafeInteger(value.ticketId) && Number.isSafeInteger(value.userId) &&
    Number.isSafeInteger(value.lastReadMessageId) && (value.lastReadMessageId as number) > 0 && typeof value.readAt === "string";
}
export function validTyping(value: unknown): value is ChatTyping {
  return record(value) && Number.isSafeInteger(value.ticketId) && Number.isSafeInteger(value.userId) &&
    typeof value.isTyping === "boolean" && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt));
}
export function ticketDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value));
}
