"use client";

import { useState } from "react";
import type { TicketTitle } from "@/lib/tickets";

export type ContentAction = "editMessage" | "deleteMessage" | "editTicket" | "deleteTicket";

export function MessageEditControls({ body, busy, onEdit, onDelete }: {
  body: string; busy: boolean; onEdit: (body: string) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [draft, setDraft] = useState(body);
  if (mode === "edit") return <form className="chat-edit-form" onSubmit={async event => { event.preventDefault(); if (draft.trim() && await onEdit(draft.trim())) setMode(null); }}>
    <label>ویرایش پیام<textarea aria-label="متن ویرایش پیام" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} required disabled={busy} autoFocus dir="auto" /></label>
    <div><button type="submit" disabled={busy || !draft.trim()}>ذخیره ویرایش</button><button type="button" disabled={busy} onClick={() => setMode(null)}>انصراف</button></div>
  </form>;
  if (mode === "delete") return <div className="chat-delete-confirm" role="group" aria-label="تأیید حذف پیام"><span>پیام حذف شود؟</span><button type="button" disabled={busy} onClick={async () => { if (await onDelete()) setMode(null); }}>حذف پیام</button><button type="button" disabled={busy} onClick={() => setMode(null)}>انصراف</button></div>;
  return <div className="chat-message-actions"><button type="button" disabled={busy} onClick={() => { setDraft(body); setMode("edit"); }}>ویرایش</button><button type="button" disabled={busy} onClick={() => setMode("delete")}>حذف</button></div>;
}

export function TicketEditControls({ title, busy, onEdit, onDelete }: TicketTitle & {
  busy: boolean; onEdit: (values: TicketTitle) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [draft, setDraft] = useState(title);
  return <div className="chat-ticket-actions">
    {mode === "edit" ? <form className="chat-edit-form chat-ticket-edit" onSubmit={async event => { event.preventDefault(); if (await onEdit({ title: draft.trim() })) setMode(null); }}>
      <label>موضوع درخواست<input aria-label="ویرایش موضوع درخواست" value={draft} onChange={event => setDraft(event.target.value)} minLength={3} maxLength={200} required disabled={busy} autoFocus /></label>
      <div><button type="submit" disabled={busy || draft.trim().length < 3}>ذخیره درخواست</button><button type="button" disabled={busy} onClick={() => setMode(null)}>انصراف</button></div>
    </form> : mode === "delete" ? <div className="chat-delete-confirm" role="group" aria-label="تأیید حذف درخواست"><span>درخواست و تمام پیام‌های آن حذف شوند؟</span><button type="button" disabled={busy} onClick={() => void onDelete()}>حذف درخواست</button><button type="button" disabled={busy} onClick={() => setMode(null)}>انصراف</button></div>
      : <><button type="button" disabled={busy} onClick={() => { setDraft(title); setMode("edit"); }}>ویرایش عنوان</button><button type="button" disabled={busy} onClick={() => setMode("delete")}>حذف درخواست</button><span>تا پیش از پذیرش پشتیبان</span></>}
  </div>;
}
