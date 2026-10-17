"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AuthApiError, AuthUser, authErrorMessage, getCurrentUser,
  login as loginRequest, logout as logoutRequest,
  register as registerRequest, type Registration,
  sessionExpiresAt, sessionExpiredEvent, sessionChangedEvent, sessionKey,
} from "@/lib/auth";

type AuthState = {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  error: string | null;
};

type AuthContextValue = AuthState & {
  isLoading: boolean;
  login: (mobile: string, password: string, rememberMe?: boolean, countryId?: number) => Promise<AuthUser>;
  register: (values: Registration) => Promise<AuthUser>;
  refreshUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const loadingState: AuthState = { user: null, status: "loading", error: null };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(loadingState);
  const revision = useRef(0);
  const restoration = useRef<AbortController | null>(null);
  const authenticationPending = useRef(false);

  const cancelRestoration = useCallback(() => {
    ++revision.current;
    restoration.current?.abort();
  }, []);

  const refreshUser = useCallback(async () => {
    if (authenticationPending.current) return null;
    const currentRevision = ++revision.current;
    restoration.current?.abort();
    const controller = new AbortController();
    restoration.current = controller;
    setState((current) => current.user ? current : loadingState);
    try {
      const user = await getCurrentUser(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
      if (revision.current === currentRevision) setState({ user, status: "authenticated", error: null });
      return user;
    } catch (error) {
      if (controller.signal.aborted || revision.current !== currentRevision) return null;
      if (error instanceof AuthApiError && error.status === 401) {
        setState({ user: null, status: "unauthenticated", error: null });
      } else {
        setState({ user: null, status: "error", error: authErrorMessage(error) });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    // Defer so a Strict Mode setup/cleanup does not start two requests.
    const timeout = window.setTimeout(() => void refreshUser(), 0);
    return () => {
      window.clearTimeout(timeout);
      cancelRestoration();
    };
  }, [refreshUser, cancelRestoration]);

  const authenticate = useCallback(async (request: () => Promise<AuthUser>) => {
    authenticationPending.current = true;
    const currentRevision = ++revision.current;
    restoration.current?.abort();
    try {
      const user = await request();
      if (revision.current === currentRevision) setState({ user, status: "authenticated", error: null });
      return user;
    } catch (error) {
      if (revision.current === currentRevision) setState({ user: null, status: "unauthenticated", error: null });
      throw error;
    } finally {
      authenticationPending.current = false;
    }
  }, []);

  const login = useCallback((mobile: string, password: string, rememberMe = false, countryId = 105) =>
    authenticate(() => loginRequest(mobile, password, rememberMe, countryId)), [authenticate]);
  const register = useCallback((values: Registration) =>
    authenticate(() => registerRequest(values)), [authenticate]);

  const logout = useCallback(async () => {
    const currentRevision = ++revision.current;
    restoration.current?.abort();
    await logoutRequest();
    if (revision.current === currentRevision) setState({ user: null, status: "unauthenticated", error: null });
  }, []);

  useEffect(() => {
    const checkSession = () => { void refreshUser(); };
    const checkStoredSession = (event: StorageEvent) => {
      if (event.key === sessionKey || event.key === null) checkSession();
    };
    window.addEventListener(sessionExpiredEvent, checkSession);
    window.addEventListener(sessionChangedEvent, checkSession);
    window.addEventListener("focus", checkSession);
    window.addEventListener("storage", checkStoredSession);
    return () => {
      window.removeEventListener(sessionExpiredEvent, checkSession);
      window.removeEventListener(sessionChangedEvent, checkSession);
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("storage", checkStoredSession);
    };
  }, [refreshUser]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    let expiresAt: number;
    try { expiresAt = sessionExpiresAt(); } catch { expiresAt = Date.now(); }
    const timer = window.setTimeout(() => void refreshUser(), Math.min(Math.max(1000, expiresAt - Date.now() - 30_000), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [state, refreshUser]);

  return (
    <AuthContext.Provider value={{ ...state, isLoading: state.status === "loading", login, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
