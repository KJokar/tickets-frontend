"use client";

import { useEffect, useState } from "react";
import { getMessageAttachment, getMessageAttachmentAccess, ticketErrorMessage, TicketApiError, type MessageAttachment } from "@/lib/tickets";
import { MediaPreview, mediaSize } from "./TicketMediaPicker";

function Attachment({ ticketId, messageId, file }: { ticketId: number; messageId: number; file: MessageAttachment }) {
  const [resource, setResource] = useState<{ url?: string; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (file.storageKey) {
        const access = await getMessageAttachmentAccess(ticketId, messageId, file.id, controller.signal);
        if (controller.signal.aborted) return;
        setResource({ url: access.url });
        refresh = setTimeout(() => setAttempt(value => value + 1), Math.max(1000, Date.parse(access.expiresAt) - Date.now() - 30000));
        return;
      }
      const blob = await getMessageAttachment(ticketId, messageId, file.id, controller.signal);
      if (controller.signal.aborted) return;
      if (blob.size !== file.size) throw new TicketApiError("پیوست به‌طور کامل دریافت نشد. دوباره تلاش کنید.", 502);
      url = URL.createObjectURL(blob); setResource({ url });
    };
    void load().catch(error => { if (!controller.signal.aborted) setResource({ error: ticketErrorMessage(error) }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); if (refresh) clearTimeout(refresh); };
  }, [ticketId, messageId, file.id, file.size, file.storageKey, attempt]);
  return <div className="ticket-media-card chat-media-card">
    {resource?.url ? <MediaPreview url={resource.url} type={file.contentType} name={file.fileName} />
      : <div className="ticket-media-loading" role="status">{resource?.error ? <><span>{resource.error}</span><button type="button" onClick={() => { setResource(null); setAttempt(value => value + 1); }}>تلاش دوباره</button></> : "در حال دریافت پیوست…"}</div>}
    <div className="ticket-media-caption"><span title={file.fileName}>{file.fileName}<small>{mediaSize(file.size)}</small></span>{resource?.url && <a href={file.storageKey ? resource.url + "&download=true" : resource.url} download={file.fileName}>دانلود</a>}</div>
  </div>;
}
export function MessageMedia({ ticketId, messageId, files }: { ticketId: number; messageId: number; files?: MessageAttachment[] }) {
  if (!files?.length) return null;
  return <div className="chat-message-media" aria-label="پیوست‌های پیام">{files.map(file => <Attachment key={file.id} ticketId={ticketId} messageId={messageId} file={file} />)}</div>;
}
