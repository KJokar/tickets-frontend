import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { login, logout } from "../src/lib/auth";
import { acceptTicket, changeTicketPriority, closeTicket, createTicket, deleteChatMessage, deleteTicket, dismissReplyReminder, editChatMessage, editTicket, getConversation, getMessageAttachment, getReplyReminders, getTicket, getTicketReport, getTicketReportRows, getAllTicketReportRows, getTicketSummary, getTransferAgents, listTickets, mergeChatMessages, releaseTicket, sendChatMessage, transferTicket, TicketApiError } from "../src/lib/tickets";

const owner = { id: 12, displayName: "کاربر", role: "Client" as const };
const item = { id: 1, createdById: 12, title: "درخواست آزمایشی", status: "Open", createdAt: new Date().toISOString(), owner };
const detail = { ...item };
const agent = { id: 13, displayName: "پشتیبان", role: "Agent" as const };
const clientMessageId = "d8328552-cd53-4001-a7fd-039886376e92";
const message = { id: 1, ticketId: 1, clientMessageId, body: "پاسخ", createdAt: item.createdAt, author: agent };
function respond(data: unknown, status = 200, pagination?: object) {
  return mock.method(globalThis, "fetch", async () => Response.json({ data, statusCode: status, ...(pagination ? { pagination } : {}) }, { status }));
}
beforeEach(async () => {
  respond({ user: { id: 12, fullName: "کاربر", mobile: "+989121234567", countryId: 105, role: "Client", permissions: ["tickets.create", "tickets.read.own", "tickets.chat"] },
    token: "access", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: "refresh", refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await login("+989121234567", "1234"); mock.restoreAll();
});
afterEach(async () => { mock.restoreAll(); await logout(); });

test("dashboard returns actual per-status counts", async () => {
  const summary = { total: 6, open: 1, inProgress: 2, answered: 1, closed: 2 };
  const fetch = respond(summary);
  assert.deepEqual(await getTicketSummary(), summary);
  assert.equal(fetch.mock.calls[0].arguments[0], "/Tickets/v1/Tickets/Dashboard");
});
test("list sends enum filters, search and pagination to the server; unset priority is valid", async () => {
  const pagination = { page: 2, perPage: 20, totalItems: 21, totalPages: 2 };
  const fetch = respond([item], 200, pagination);
  assert.deepEqual(await listTickets({ status: "Open", priority: "Medium", search: "موضوع & دیگر", page: 2 }), { items: [item], pagination });
  const url = new URL(String(fetch.mock.calls[0].arguments[0]), "http://local");
  assert.equal(url.pathname, "/Tickets/v1/Tickets/List");
  assert.equal(url.searchParams.get("search"), "موضوع & دیگر");
  assert.equal(url.searchParams.get("status"), "Open");
  assert.equal(url.searchParams.get("priority"), "Medium");
  assert.equal(url.searchParams.has("department"), false);
  assert.equal(url.searchParams.get("page"), "2");
});
test("unassigned uses its actual endpoint", async () => {
  const fetch = respond([], 200, { page: 1, perPage: 20, totalItems: 0, totalPages: 0 });
  await listTickets({ scope: "unassigned" });
  assert.match(String(fetch.mock.calls[0].arguments[0]), /Tickets\/Unassigned\?/);
});

test("sorting sends field and direction alongside pagination and existing filters", async () => {
  const fetch = respond([], 200, { page: 2, perPage: 20, totalItems: 0, totalPages: 0 });
  await listTickets({ scope: "assigned", sortBy: "Priority", sortOrder: "Asc", status: "InProgress", search: "پرداخت", page: 2 });
  const url = new URL(String(fetch.mock.calls[0].arguments[0]), "http://local");
  assert.equal(url.searchParams.get("sortBy"), "Priority");
  assert.equal(url.searchParams.get("sortOrder"), "Asc");
  assert.equal(url.searchParams.get("mineOnly"), "true");
  assert.equal(url.searchParams.get("status"), "InProgress");
  assert.equal(url.searchParams.get("page"), "2");
  await listTickets({ scope: "unassigned", sortBy: "UpdatedAt", sortOrder: "Desc" });
  const queue = new URL(String(fetch.mock.calls[1].arguments[0]), "http://local");
  assert.equal(queue.pathname, "/Tickets/v1/Tickets/Unassigned");
  assert.equal(queue.searchParams.get("sortBy"), "UpdatedAt");
  assert.equal(queue.searchParams.get("sortOrder"), "Desc");
});

test("unread metadata accepts booleans and older responses, but rejects malformed flags", async () => {
  const pagination = { page: 1, perPage: 20, totalItems: 1, totalPages: 1 };
  for (const fields of [{}, { hasUnreadMessages: true }, { hasUnreadMessages: false }]) {
    const ticket = { ...item, ...fields };
    respond([ticket], 200, pagination);
    assert.deepEqual((await listTickets()).items, [ticket]);
    mock.restoreAll();
  }
  for (const hasUnreadMessages of [null, "false", 1]) {
    respond([{ ...item, hasUnreadMessages }], 200, pagination);
    await assert.rejects(listTickets(), TicketApiError);
    mock.restoreAll();
  }
});

test("current API tickets remain valid without removed message counts or customer priority", async () => {
  // Mirrors the backend's WhenWritingNull output, including an accepted customer ticket.
  const accepted = { ...detail, assignedToId: agent.id, assignedTo: agent, acceptedAt: item.createdAt, status: "InProgress" };
  const pagination = { page: 1, perPage: 20, totalItems: 1, totalPages: 1 };
  for (const fields of [{}, { priority: null }, { priority: "High" }]) {
    const ticket = { ...accepted, ...fields };
    respond([ticket], 200, pagination);
    assert.deepEqual((await listTickets()).items, [ticket]);
    mock.restoreAll();
    respond(ticket);
    assert.deepEqual(await getTicket(ticket.id), ticket);
    mock.restoreAll();
  }
});
test("assigned-to-me uses server mineOnly filtering with server pagination", async () => {
  const pagination = { page: 2, perPage: 1, totalItems: 2, totalPages: 2 };
  const fetch = respond([{ ...item, assignedToId: 12 }], 200, pagination);
  const result = await listTickets({ scope: "assigned", page: 2, perPage: 1 });
  const url = new URL(String(fetch.mock.calls[0].arguments[0]), "http://local");
  assert.equal(url.searchParams.get("mineOnly"), "true");
  assert.equal(url.searchParams.get("page"), "2");
  assert.deepEqual(result.pagination, pagination);
  assert.equal(fetch.mock.callCount(), 1);
});
test("create sends only title and description required by strict backend contract", async () => {
  const fetch = respond(detail, 201);
  assert.equal((await createTicket({ title: "موضوع", description: "توضیحات" })).id, 1);
  const [path, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(path, "/Tickets/v1/Tickets/Create");
  assert.equal(init.method, "POST");
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer access");
  assert.deepEqual(JSON.parse(init.body as string), { title: "موضوع", description: "توضیحات" });
});
test("create uploads files directly to CDN and sends only signed references to ticket API", async () => {
  const fetch = mock.method(globalThis, "fetch", async (path: string | URL | Request) => {
    if (String(path).endsWith("/Media/Uploads")) return Response.json({ data: { uploadUrl: "http://localhost:5083/api/V1/Files/MessageAttachment", token: "upload-only-token" } });
    if (String(path).startsWith("http://localhost:5083/")) return Response.json({ status: 0, result: [{ receipt: "signed-file-receipt" }] });
    return Response.json({ data: detail }, { status: 201 });
  });
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 128]);
  const file = new File([bytes], "تصویر.png", { type: "image/png" });
  await createTicket({ title: "موضوع", description: "پیام اول", files: [file] });
  const [path, init] = fetch.mock.calls[1].arguments as unknown as [string, RequestInit];
  assert.equal(path, "http://localhost:5083/api/V1/Files/MessageAttachment");
  assert.equal(new Headers(init.headers).has("Content-Type"), false);
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer upload-only-token");
  const form = init.body as FormData;
  const uploaded = form.get("files") as File;
  assert.equal(uploaded.name, file.name);
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), bytes);
  const [createPath, createInit] = fetch.mock.calls[2].arguments as unknown as [string, RequestInit];
  assert.equal(createPath, "/Tickets/v1/Tickets/Create");
  assert.deepEqual(JSON.parse(createInit.body as string), { title: "موضوع", description: "پیام اول", attachments: [{ receipt: "signed-file-receipt" }] });
});
test("attachment downloads use authorization and retain binary content", async () => {
  const bytes = new Uint8Array([0, 255, 128, 200]);
  const fetch = mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "Content-Type": "image/png" } }));
  const blob = await getMessageAttachment(1, 2, clientMessageId);
  const [path, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(path, `/Tickets/v1/Tickets/1/Messages/2/Attachments/${clientMessageId}`);
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer access");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
test("conversation accepts attachment metadata and rejects malformed files", async () => {
  const attachment = { id: clientMessageId, fileName: "test.png", contentType: "image/png", size: 18 };
  const conversation = { ticketId: 1, startedAt: item.createdAt, client: owner, agent, messages: [{ ...message, attachments: [attachment] }] };
  respond(conversation);
  assert.deepEqual((await getConversation(1)).messages[0].attachments, [attachment]);
  mock.restoreAll();
  respond({ ...conversation, messages: [{ ...message, attachments: [{ ...attachment, size: -1 }] }] });
  await assert.rejects(getConversation(1), TicketApiError);
});
test("detail, explicit acceptance, priority and status changes use actual routes and enums", async () => {
  const fetch = respond(detail);
  await getTicket(1);
  assert.equal(fetch.mock.calls[0].arguments[0], "/Tickets/v1/Tickets/Select/1");
  await acceptTicket(1, "High");
  const [acceptPath, acceptInit] = fetch.mock.calls[1].arguments as unknown as [string, RequestInit];
  assert.equal(acceptPath, "/Tickets/v1/Tickets/1/Accept");
  assert.equal(acceptInit.method, "POST");
  assert.deepEqual(JSON.parse(acceptInit.body as string), { priority: "High" });
  await closeTicket(1);
  const [statusPath, statusInit] = fetch.mock.calls[2].arguments as unknown as [string, RequestInit];
  assert.equal(statusPath, "/Tickets/v1/Tickets/1/Status");
  assert.equal(statusInit.method, "PATCH");
  assert.deepEqual(JSON.parse(statusInit.body as string), { status: "Closed" });
  await changeTicketPriority(1, "Low");
  const [priorityPath, priorityInit] = fetch.mock.calls[3].arguments as unknown as [string, RequestInit];
  assert.equal(priorityPath, "/Tickets/v1/Tickets/1/Priority");
  assert.equal(priorityInit.method, "PATCH");
  assert.deepEqual(JSON.parse(priorityInit.body as string), { priority: "Low" });
});

test("handoff destinations use name search and ten-item pagination and reject customer accounts", async () => {
  const pagination = { page: 2, perPage: 10, totalItems: 11, totalPages: 2 };
  const destination = { ...agent, mobile: "+989121234567" };
  const fetch = respond([destination], 200, pagination);
  assert.deepEqual(await getTransferAgents(1, " پشتیبان ", 2), { items: [destination], pagination });
  const path = new URL(String(fetch.mock.calls[0].arguments[0]), "https://test.invalid");
  assert.equal(path.pathname, "/Tickets/v1/Tickets/1/TransferAgents");
  assert.equal(path.searchParams.get("search"), "پشتیبان");
  assert.equal(path.searchParams.get("perPage"), "10");
  assert.equal(path.searchParams.get("page"), "2");
  mock.restoreAll();
  for (const data of [[owner], [agent], [{ ...destination, id: 0 }], [{ ...destination, mobile: "" }], null]) {
    respond(data, 200, pagination); await assert.rejects(getTransferAgents(1), TicketApiError); mock.restoreAll();
  }
});

test("reply reminders validate ticket links and notification identity; dismissal requests a durable snooze", async () => {
  const reminder = { ticketId: 1, title: "پاسخ فراموش‌شده", customerName: "مشتری", notificationId: clientMessageId, raisedAt: item.createdAt };
  let fetch = respond([reminder]);
  assert.deepEqual(await getReplyReminders(), [reminder]);
  assert.equal(fetch.mock.calls[0].arguments[0], "/Tickets/v1/Tickets/ReplyReminders");
  mock.restoreAll();
  fetch = respond({ ticketId: 1, nextReminderAt: new Date(Date.now() + 300000).toISOString() });
  await dismissReplyReminder(reminder);
  const [path, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(path, "/Tickets/v1/Tickets/1/ReplyReminder/Dismiss"); assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body as string), { notificationId: clientMessageId });
  mock.restoreAll();
  for (const value of [{ ...reminder, ticketId: -1 }, { ...reminder, notificationId: "bad" }, { ...reminder, raisedAt: "bad" }]) {
    respond([value]); await assert.rejects(getReplyReminders(), TicketApiError); mock.restoreAll();
  }
});

test("direct transfer and queue release validate the resulting ownership and status", async () => {
  const transferred = { ...detail, status: "InProgress", assignedToId: agent.id, assignedTo: agent, acceptedAt: item.createdAt };
  let fetch = respond(transferred);
  assert.deepEqual(await transferTicket(1, agent.id), transferred);
  let [path, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(path, "/Tickets/v1/Tickets/1/Transfer"); assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body as string), { agentId: agent.id });
  mock.restoreAll();
  const released = { ...detail, acceptedAt: item.createdAt };
  fetch = respond(released);
  assert.deepEqual(await releaseTicket(1), released);
  [path, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(path, "/Tickets/v1/Tickets/1/Release"); assert.equal(init.method, "POST");
  mock.restoreAll();
  for (const data of [{ ...transferred, assignedToId: 99 }, { ...transferred, status: "Open" }, { ...transferred, id: 99 }]) {
    respond(data); await assert.rejects(transferTicket(1, agent.id), TicketApiError); mock.restoreAll();
  }
  respond(transferred); await assert.rejects(releaseTicket(1), TicketApiError);
});

test("conversation validates participants and ticket IDs; messages preserve caller UUID on retry", async () => {
  const conversation = { ticketId: 1, startedAt: item.createdAt, client: owner, agent, messages: [message] };
  const fetch = respond(conversation);
  assert.deepEqual(await getConversation(1), conversation);
  assert.equal(fetch.mock.calls[0].arguments[0], "/Tickets/v1/Tickets/1/Conversation?includeDeleted=true");
  mock.restoreAll();
  const sent = respond(message);
  for (let i = 0; i < 2; i++) assert.deepEqual(await sendChatMessage(1, "پاسخ", clientMessageId), message);
  for (const call of sent.mock.calls) {
    const [path, init] = call.arguments as unknown as [string, RequestInit];
    assert.equal(path, "/Tickets/v1/Tickets/1/Messages");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { body: "پاسخ", clientMessageId });
  }
  mock.restoreAll();
  for (const invalid of [{ ...conversation, ticketId: 2 }, { ...conversation, agent: { id: "invalid" } }, { ...conversation, messages: [{ ...message, ticketId: 2 }] }]) {
    respond(invalid); await assert.rejects(getConversation(1), TicketApiError); mock.restoreAll();
  }
  respond({ ...message, clientMessageId: "different" });
  await assert.rejects(sendChatMessage(1, "پاسخ", clientMessageId), TicketApiError);
});
test("pending conversations accept a missing agent and existing client messages", async () => {
  const pending = { ticketId: 1, startedAt: item.createdAt, client: owner, messages: [{ ...message, author: owner }] };
  for (const participant of [{}, { agent: null }]) {
    respond({ ...pending, ...participant });
    assert.deepEqual((await getConversation(1)).messages, pending.messages);
    mock.restoreAll();
  }
});

test("a concurrent revision retries a message once with the same UUID", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  mock.method(globalThis, "fetch", async (path: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    return calls.length === 1 ? Response.json({ data: null }, { status: 409 })
      : Response.json({ data: calls.length === 2 ? detail : message });
  });
  assert.deepEqual(await sendChatMessage(1, "پاسخ", clientMessageId), message);
  assert.deepEqual(calls.map(call => call.path), ["/Tickets/v1/Tickets/1/Messages", "/Tickets/v1/Tickets/Select/1", "/Tickets/v1/Tickets/1/Messages"]);
  assert.equal(calls[0].init?.body, calls[2].init?.body);
});

test("a message conflict never retries into a closed conversation or loops", async () => {
  for (const status of ["Closed", "InProgress"]) {
    const fetch = mock.method(globalThis, "fetch", async (path: string | URL | Request) =>
      String(path).includes("/Select/") ? Response.json({ data: { ...detail, status } })
        : Response.json({ data: null }, { status: 409 }));
    await assert.rejects(sendChatMessage(1, "پاسخ", clientMessageId), (error: unknown) => error instanceof TicketApiError && error.status === 409);
    assert.equal(fetch.mock.callCount(), status === "Closed" ? 2 : 3);
    mock.restoreAll();
  }
});

test("not found, denied and conflict errors have Persian messages", async () => {
  for (const status of [404, 403, 409]) {
    respond(null, status);
    await assert.rejects(getTicket(1), (error: unknown) => error instanceof TicketApiError && error.status === status && /[\u0600-\u06ff]/.test(error.message));
    mock.restoreAll();
  }
});
test("malformed ticket responses and invalid IDs fail without rendering unsafe data", async () => {
  for (const data of [null, {}, { ...detail, status: "Unexpected" }, { ...detail, owner: null }, { ...detail, priority: "Unknown" }]) {
    respond(data);
    await assert.rejects(getTicket(1), TicketApiError); mock.restoreAll();
  }
  const fetch = respond(detail);
  await assert.rejects(getTicket("../2"), TicketApiError);
  assert.equal(fetch.mock.callCount(), 0);
});

test("ticket and message mutations validate identity and preserve edit, delete and read metadata", async () => {
  respond(detail);
  assert.deepEqual(await editTicket(1, { title: detail.title }), detail);
  mock.restoreAll();
  const edited = { ...message, body: "Corrected", editedAt: item.createdAt, isRead: false };
  respond(edited);
  assert.deepEqual(await editChatMessage(1, 1, "Corrected"), edited);
  mock.restoreAll();
  const deleted = { ...edited, body: "", deletedAt: item.createdAt };
  respond(deleted);
  assert.deepEqual(await deleteChatMessage(1, 1), deleted);
  mock.restoreAll();
  respond({ ticketId: 1 });
  await deleteTicket(1);
  mock.restoreAll();
  for (const malformed of [{ ...edited, id: 2 }, { ...edited, ticketId: 2 }, { ...edited, isRead: "false" }, { ...edited, editedAt: "invalid" }]) {
    respond(malformed);
    await assert.rejects(editChatMessage(1, 1, "Corrected"), TicketApiError);
    mock.restoreAll();
  }
  respond(message);
  await assert.rejects(deleteChatMessage(1, 1), TicketApiError);
});

test("reports send date and role scope filters and reject malformed chart data", async () => {
  const report = { from: "2026-10-01", to: "2026-10-02", generatedAt: item.createdAt, timeZone: "Asia/Tehran",
    summary: { total: 1, open: 1, inProgress: 0, answered: 0, closed: 0 }, dailyCreated: [{ date: "2026-10-01", count: 0 }, { date: "2026-10-02", count: 1 }] };
  const fetch = respond(report);
  assert.deepEqual(await getTicketReport({ from: report.from, to: report.to }), report);
  const url = new URL(String(fetch.mock.calls[0].arguments[0]), "http://local");
  assert.equal(url.searchParams.get("from"), report.from);
  assert.equal(url.searchParams.get("to"), report.to);
  assert.equal(url.searchParams.has("mineOnly"), false);
  mock.restoreAll();
  for (const invalid of [{ ...report, summary: { total: -1 } }, { ...report, dailyCreated: [{ date: "2026-10-01", count: -1 }] }, { ...report, timeZone: "invalid" }]) {
    respond(invalid); await assert.rejects(getTicketReport(), TicketApiError); mock.restoreAll();
  }
});


test("report rows preserve filters and pagination and reject malformed customer data", async () => {
  const row = { id: 1, customerName: "مشتری", title: "مشکل پرداخت" };
  const pagination = { page: 2, perPage: 20, totalItems: 21, totalPages: 2 };
  const fetch = respond([row], 200, pagination);
  assert.deepEqual(await getTicketReportRows({ from: "2026-10-01", to: "2026-10-16", page: 2 }), { items: [row], pagination });
  const url = new URL(String(fetch.mock.calls[0].arguments[0]), "http://local");
  assert.equal(url.pathname, "/Tickets/v1/Tickets/Reports/Tickets");
  assert.equal(url.searchParams.get("from"), "2026-10-01");
  assert.equal(url.searchParams.get("page"), "2");
  mock.restoreAll();
  for (const invalid of [{ ...row, customerName: null }, { ...row, id: 0 }, { ...row, title: {} }]) {
    respond([invalid], 200, pagination);
    await assert.rejects(getTicketReportRows({ from: "2026-10-01", to: "2026-10-16" }), TicketApiError); mock.restoreAll();
  }
});

test("report export loads every page and rejects changes between pages", async () => {
  const range = { from: "2026-10-01", to: "2026-10-16" };
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, customerName: "مشتری", title: `درخواست ${index}` }));
  for (const changed of [false, true]) {
    const fetch = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input), "http://local").searchParams.get("page"));
      return Response.json({ data: rows.slice((page - 1) * 100, page * 100), pagination: { page, perPage: 100, totalItems: changed && page === 2 ? 102 : 101, totalPages: 2 } });
    });
    if (changed) await assert.rejects(getAllTicketReportRows(range), TicketApiError);
    else assert.deepEqual(await getAllTicketReportRows(range), rows);
    assert.equal(fetch.mock.calls.length, 2); mock.restoreAll();
  }
});

test("late message updates never clear read state or restore deleted messages", () => {
  const original = { ...message, version: 1, isRead: false };
  const edited = { ...original, version: 2, body: "Edited text" };
  const read = { ...edited, version: 3, isRead: true };
  assert.equal(mergeChatMessages([read], [original, edited])[0].isRead, true);
  assert.equal(mergeChatMessages([read], [original, edited])[0].body, "Edited text");
  const readPush = { ...original, isRead: true };
  assert.equal(mergeChatMessages([readPush], [edited])[0].isRead, true);
  const deleted = { ...edited, body: "", version: 4, deletedAt: item.createdAt };
  const merged = mergeChatMessages([deleted], [original, edited]);
  assert.equal(merged[0].deletedAt, item.createdAt);
  assert.equal(merged[0].body, "");
  assert.equal(merged.filter(item => !item.deletedAt).length, 0);
});

test("unread newer message versions win over older HTTP responses", () => {
  const original = { ...message, version: 1, isRead: false };
  const edited = { ...original, version: 2, body: "Latest unread text" };
  const [merged] = mergeChatMessages([edited], [original]);
  assert.equal(merged.body, edited.body);
  assert.equal(merged.isRead, false);
  assert.equal(merged.version, 2);
});
