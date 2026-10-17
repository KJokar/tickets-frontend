"use client";

import { useEffect, useState } from "react";
import { useTicketRealtime } from "./TicketRealtime";

export function useChatPresence(ticketId: number, peerId?: number | null): "online" | "offline" | "unknown" {
  const { state, subscribe, getPresence } = useTicketRealtime();
  const [snapshot, setSnapshot] = useState<{ ticketId: number; peerId: number; online: boolean } | null>(null);
  useEffect(() => {
    if (state !== "connected" || !peerId) return;
    const watchedPeer = peerId;
    let disposed = false, running = false, queued = false;
    async function refresh() {
      if (disposed) return;
      if (running) { queued = true; return; }
      running = true;
      const result = await getPresence(ticketId);
      if (!disposed) setSnapshot(result && result.userId === watchedPeer ? { ticketId, peerId: watchedPeer, online: result.isOnline } : null);
      running = false;
      if (queued) { queued = false; void refresh(); }
    }
    const unsubscribe = subscribe(event => {
      if (event.type === "presence" && event.data.userId === peerId || event.type === "connected") void refresh();
    });
    const onFocus = () => { if (!document.hidden) void refresh(); };
    // Recheck queue previews and recover notifications missed during a reconnect.
    const timer = setInterval(onFocus, 10000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    void refresh();
    return () => { disposed = true; unsubscribe(); clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [ticketId, peerId, state, subscribe, getPresence]);
  if (state !== "connected" || !peerId || snapshot?.ticketId !== ticketId || snapshot.peerId !== peerId) return "unknown";
  return snapshot.online ? "online" : "offline";
}
