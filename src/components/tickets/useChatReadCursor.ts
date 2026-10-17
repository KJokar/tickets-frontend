"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatReadReceipt } from "@/lib/tickets";

export function useChatReadCursor(ticketId: number, enabled: boolean, markRead: (ticketId: number, id: number, version?: number) => Promise<ChatReadReceipt>, onReceipt: (receipt: ChatReadReceipt) => void) {
  const acknowledged = useRef(new Set<number>());
  const queued = useRef(new Map<number, number | undefined>());
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  const queueRead = useCallback((id: number, version?: number) => {
    if (!enabled || !Number.isSafeInteger(id) || acknowledged.current.has(id)) return;
    queued.current.set(id, version);
    if (timer.current || inFlight.current) return;
    async function flush() {
      timer.current = null;
      if (!active.current || document.hidden || !document.hasFocus() || inFlight.current) return;
      inFlight.current = true;
      try {
        for (const [messageId, version] of [...queued.current]) {
          if (!active.current || document.hidden || !document.hasFocus()) break;
          const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"][data-incoming="true"]`);
          const container = element?.closest(".chat-message-list");
          if (!element || !container) { queued.current.delete(messageId); continue; }
          const rect = element.getBoundingClientRect(), bounds = container.getBoundingClientRect();
          const visibleHeight = Math.min(rect.bottom, bounds.bottom, innerHeight) - Math.max(rect.top, bounds.top, 0);
          if (visibleHeight < Math.min(48, rect.height * .6)) { queued.current.delete(messageId); continue; }
          const receipt = await markRead(ticketId, messageId, version);
          if (!active.current) break;
          acknowledged.current.add(messageId); queued.current.delete(messageId); onReceipt(receipt);
        }
      } catch { /* A retry retains the queued cursor, never claims that a message was read. */ }
      finally {
        inFlight.current = false;
        if (active.current && queued.current.size) timer.current = setTimeout(() => void flush(), 2000);
      }
    }
    timer.current = setTimeout(() => void flush(), 250);
  }, [enabled, markRead, onReceipt, ticketId]);
  return queueRead;
}
