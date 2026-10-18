"use client";

import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from "@microsoft/signalr";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { realtimeAccessToken } from "@/lib/auth";
import { apiUrl } from "@/lib/api-url";
import { markConversationRead, validMessage, validReadReceipt, validTicket, validTyping, validPresence, type ChatPresence, type ChatMessage, type ChatReadReceipt, type ChatTyping, type Ticket } from "@/lib/tickets";

type RealtimeEvent = { type: "message"; data: ChatMessage } | { type: "ticket"; data: Ticket } | { type: "deleted" | "access" | "reminders"; data: { ticketId: number } } | { type: "read"; data: ChatReadReceipt } | { type: "typing"; data: ChatTyping } | { type: "presence"; data: { userId: number } } | { type: "queue" } | { type: "connected" };
type Listener = (event: RealtimeEvent) => void;
type RealtimeContext = { state: "connecting" | "connected" | "offline"; subscribe: (listener: Listener) => () => void; markRead: (ticketId: number, messageId: number, version?: number) => Promise<ChatReadReceipt>; typing: (ticketId: number, value: boolean) => void; getPresence: (ticketId: number) => Promise<ChatPresence | null> };
const Context = createContext<RealtimeContext | null>(null);

export function TicketRealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <RealtimeSession key={user?.id ?? "anonymous"} userId={user?.id}>{children}</RealtimeSession>;
}
function RealtimeSession({ userId, children }: { userId?: number; children: ReactNode }) {
  const [state, setState] = useState<RealtimeContext["state"]>(userId ? "connecting" : "offline");
  const hub = useRef<HubConnection | null>(null);
  const listeners = useRef(new Set<Listener>());
  const typingSent = useRef<{ ticketId: number; value: boolean; at: number } | null>(null);
  const publish = useCallback((event: RealtimeEvent) => listeners.current.forEach(listener => listener(event)), []);
  const subscribe = useCallback((listener: Listener) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, []);
  useEffect(() => {
    if (!userId) return;
    let disposed = false; let retry: ReturnType<typeof setTimeout> | null = null;
    const connection = new HubConnectionBuilder().withUrl(apiUrl("/hubs/tickets"), {
      accessTokenFactory: async () => { if (disposed) throw new Error("Connection stopped"); return realtimeAccessToken(userId); }, withCredentials: false,
    }).withAutomaticReconnect([0, 1000, 3000, 8000]).configureLogging(LogLevel.None).build();
    hub.current = connection;
    connection.on("MessageReceived", (data: unknown) => { if (!disposed && validMessage(data)) publish({ type: "message", data }); });
    connection.on("TicketChanged", (data: unknown) => { if (!disposed && validTicket(data)) publish({ type: "ticket", data }); });
    connection.on("TicketDeleted", (data: { ticketId?: unknown }) => { if (!disposed && data && Number.isSafeInteger(data.ticketId)) publish({ type: "deleted", data: { ticketId: data.ticketId as number } }); });
    connection.on("TicketAccessChanged", (data: { ticketId?: unknown }) => { if (!disposed && data && Number.isSafeInteger(data.ticketId)) publish({ type: "access", data: { ticketId: data.ticketId as number } }); });
    connection.on("ReplyRemindersChanged", (data: { ticketId?: unknown }) => { if (!disposed && data && Number.isSafeInteger(data.ticketId)) publish({ type: "reminders", data: { ticketId: data.ticketId as number } }); });
    connection.on("MessagesRead", (data: unknown) => { if (!disposed && validReadReceipt(data)) publish({ type: "read", data }); });
    connection.on("TypingChanged", (data: unknown) => { if (!disposed && validTyping(data)) publish({ type: "typing", data }); });
    connection.on("PresenceChanged", (data: { userId?: unknown }) => { if (!disposed && data && Number.isSafeInteger(data.userId) && (data.userId as number) > 0) publish({ type: "presence", data: { userId: data.userId as number } }); });
    connection.on("QueueChanged", () => { if (!disposed) publish({ type: "queue" }); });
    connection.onreconnecting(() => { if (!disposed) setState("connecting"); });
    connection.onreconnected(() => { if (!disposed) { setState("connected"); publish({ type: "connected" }); } });
    async function start() {
      if (disposed || connection.state !== HubConnectionState.Disconnected) return;
      try { await connection.start(); if (!disposed) { setState("connected"); publish({ type: "connected" }); } }
      catch { if (!disposed) { setState("offline"); retry = setTimeout(() => void start(), 5000); } }
    }
    connection.onclose(() => { if (!disposed) { setState("offline"); retry = setTimeout(() => void start(), 1500); } });
    retry = setTimeout(() => void start(), 0);
    return () => { disposed = true; if (retry) clearTimeout(retry); hub.current = null; void connection.stop(); };
  }, [userId, publish]);
  const markRead = useCallback(async (ticketId: number, messageId: number, version?: number) => {
    const connection = hub.current;
    if (connection?.state === HubConnectionState.Connected) {
      try {
        const result = await connection.invoke<{ data?: unknown }>("MarkRead", ticketId, { lastReadMessageId: messageId, version });
        if (validReadReceipt(result.data) && result.data.ticketId === ticketId) return result.data;
      } catch { /* Durable HTTP fallback for reconnect gaps. */ }
    }
    return markConversationRead(ticketId, messageId, version);
  }, []);
  const typing = useCallback((ticketId: number, value: boolean) => {
    if (hub.current?.state !== HubConnectionState.Connected) return;
    const previous = typingSent.current, now = Date.now();
    if (previous?.ticketId === ticketId && previous.value === value && now - previous.at < 1200) return;
    typingSent.current = { ticketId, value, at: now };
    void hub.current.invoke("SetTyping", ticketId, value).catch(() => {});
  }, []);
  const getPresence = useCallback(async (ticketId: number): Promise<ChatPresence | null> => {
    const connection = hub.current;
    if (connection?.state !== HubConnectionState.Connected) return null;
    try {
      const result = await connection.invoke<{ data?: unknown }>("GetPresence", ticketId);
      return validPresence(result.data) && result.data.ticketId === ticketId ? result.data : null;
    } catch { return null; }
  }, []);
  const value = useMemo(() => ({ state, subscribe, markRead, typing, getPresence }), [state, subscribe, markRead, typing, getPresence]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTicketRealtime() {
  const context = useContext(Context);
  if (!context) throw new Error("TicketRealtimeProvider is missing");
  return context;
}
export function useTicketListUpdates(reload: () => void) {
  const { subscribe } = useTicketRealtime();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, 200);
    };
    const unsubscribe = subscribe(event => {
      if (["ticket", "queue", "connected", "deleted", "access", "message", "read"].includes(event.type)) refresh();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { unsubscribe(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); if (timer) clearTimeout(timer); };
  }, [subscribe, reload]);
}
