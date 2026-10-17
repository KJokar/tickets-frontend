"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TicketApiError, ticketErrorMessage } from "@/lib/tickets";

export function useTicketData<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  type Update = (current: T | null) => T | null;
  const activeRequest = useRef<{ controller: AbortController; updates: Update[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const request = { controller, updates: [] as Update[] };
    activeRequest.current = request;
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setState(current => ({ ...current, loading: true, error: "" }));
      return loader(controller.signal);
    }).then(data => {
      if (!controller.signal.aborted && data !== null) {
        // Backfill missed events, then replay pushes received while it was loading.
        // Aborting on every push could discard older messages missed offline.
        const merged = request.updates.reduce<T | null>((value, apply) => apply(value), data);
        setState({ data: merged, loading: false, error: "" });
      }
    }).catch(error => {
      if (!controller.signal.aborted) setState(current => ({
        data: error instanceof TicketApiError && [403, 404].includes(error.status) ? null : current.data,
        loading: false, error: ticketErrorMessage(error),
      }));
    }).finally(() => { if (activeRequest.current === request) activeRequest.current = null; });
    return () => { controller.abort(); if (activeRequest.current === request) activeRequest.current = null; };
  }, [loader, attempt]);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  const update = useCallback((value: T | ((current: T | null) => T | null)) => {
    const apply: Update = typeof value === "function" ? value as Update : () => value;
    const request = activeRequest.current;
    if (request && !request.controller.signal.aborted) request.updates.push(apply);
    setState(current => ({ ...current, data: apply(current.data), error: "" }));
  }, []);
  return { ...state, reload, update };
}
