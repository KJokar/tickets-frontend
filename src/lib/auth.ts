import type { Country } from "./phone";
export type UserRole = "client" | "agent";
export type AuthUser = { id: number; fullName: string; name?: string; mobile: string; countryId: number; role: UserRole; permissions: string[]; avatarUrl?: string };
export type AuthFieldName = "fullName" | "countryId" | "mobile" | "password" | "confirmPassword" | "role";
export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;
type AuthPayload = Record<string, unknown>;
type AuthSession = {
  user: AuthUser; token: string; expiresAt: string;
  refreshToken: string; refreshTokenExpiresAt: string; rememberMe: boolean;
};
export type Registration = { fullName: string; mobile: string; countryId: number; password: string; confirmPassword: string; role: UserRole };
export type RoleOption = { id: number; value: UserRole; label: string };
export function canCreateTicket(user: AuthUser | null | undefined): boolean {
  return user?.role === "client" && user.permissions.includes("tickets.create");
}
export const sessionKey = "ticketino.auth.v1";
export const sessionExpiredEvent = "ticketino:session-expired";
export const sessionChangedEvent = "ticketino:session-changed";
const refreshWindow = 30_000;
let memorySession: AuthSession | null = null;
let revision = 0;
let refreshWork: { revision: number; promise: Promise<AuthSession> } | null = null;

export class AuthApiError extends Error {
  constructor(message: string, public status: number, public fieldErrors: AuthFieldErrors = {}) {
    super(message); this.name = "AuthApiError";
  }
}
function isRecord(value: unknown): value is AuthPayload { return value !== null && typeof value === "object" && !Array.isArray(value); }
function asUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) return null;
  const role = typeof value.role === "string" ? value.role.toLowerCase() : "";
  if (role !== "client" && role !== "agent") return null;
  if (!Number.isSafeInteger(value.id) || (value.id as number) <= 0 || typeof value.fullName !== "string" ||
      !value.fullName.trim() || typeof value.mobile !== "string" || !/^\+[1-9]\d{6,14}$/.test(value.mobile) || !Number.isSafeInteger(value.countryId) || (value.countryId as number) < 1 ||
      !Array.isArray(value.permissions) || !value.permissions.every(p => typeof p === "string")) return null;
  return { id: value.id as number, fullName: value.fullName, mobile: value.mobile, countryId: value.countryId as number, role, permissions: value.permissions,
    ...(typeof value.avatarUrl === "string" && value.avatarUrl.startsWith("/users/avatars/") ? { avatarUrl: value.avatarUrl } : {}) };
}
function asSession(value: unknown): AuthSession | null {
  if (!isRecord(value)) return null;
  const user = asUser(value.user);
  if (!user || typeof value.token !== "string" || !value.token.trim() || typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) || typeof value.refreshToken !== "string" || !value.refreshToken.trim() ||
      typeof value.refreshTokenExpiresAt !== "string" || !Number.isFinite(Date.parse(value.refreshTokenExpiresAt)) ||
      Date.parse(value.refreshTokenExpiresAt) <= Date.now()) return null;
  return { user, token: value.token, expiresAt: value.expiresAt, refreshToken: value.refreshToken,
    refreshTokenExpiresAt: value.refreshTokenExpiresAt, rememberMe: value.rememberMe === true };
}
function emit(event: string) { if (typeof window !== "undefined") window.dispatchEvent(new Event(event)); }
function clearSession() {
  ++revision; memorySession = null;
  try { window.sessionStorage.removeItem(sessionKey); } catch { /* Storage may be disabled. */ }
  try { window.localStorage.removeItem(sessionKey); } catch { /* Storage may be disabled. */ }
}
function expireSession(): never {
  clearSession(); emit(sessionExpiredEvent);
  throw new AuthApiError("نشست شما پایان یافته است. دوباره وارد شوید.", 401);
}
function saveSession(session: AuthSession, rememberMe: boolean) {
  memorySession = null;
  const stored = { ...session, rememberMe };
  try { window[rememberMe ? "localStorage" : "sessionStorage"].setItem(sessionKey, JSON.stringify(stored)); }
  catch { memorySession = stored; }
}
function currentSession(): AuthSession {
  let value: unknown = memorySession;
  let remembered = memorySession?.rememberMe ?? false;
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      const stored = window[storage].getItem(sessionKey);
      if (stored !== null) { value = JSON.parse(stored); remembered = storage === "localStorage"; break; }
    } catch (error) { if (error instanceof SyntaxError) { value = null; break; } }
  }
  const session = asSession(value);
  if (!session) {
    clearSession();
    throw new AuthApiError("نشست شما پایان یافته است. دوباره وارد شوید.", 401);
  }
  return { ...session, rememberMe: remembered };
}
export function sessionExpiresAt(): number { return Date.parse(currentSession().expiresAt); }
function persian(value: unknown): string | undefined { return typeof value === "string" && /[\u0600-\u06FF]/.test(value) ? value : undefined; }
function requestSignal(signal?: AbortSignal | null, timeout = 15_000): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}
function fieldErrors(payload: AuthPayload): AuthFieldErrors {
  if (!isRecord(payload.errors)) return {};
  const labels: Record<AuthFieldName, string> = { fullName: "نام و نام خانوادگی معتبر نیست.", countryId: "کشور معتبر نیست.", mobile: "شماره موبایل معتبر نیست.",
    password: "رمز عبور با شرایط سرویس مطابقت ندارد.", confirmPassword: "تکرار رمز عبور یکسان نیست.", role: "نوع حساب را انتخاب کنید." };
  const errors: AuthFieldErrors = {};
  for (const field of Object.keys(labels) as AuthFieldName[]) {
    const value = payload.errors[field] ?? payload.errors[field[0].toUpperCase() + field.slice(1)];
    if (value !== undefined) errors[field] = persian(Array.isArray(value) ? value[0] : value) ?? labels[field];
  }
  return errors;
}
function errorMessage(status: number, payload: AuthPayload, path: string): string {
  const message = persian(payload.message) ?? persian(payload.error);
  if (message) return message;
  if (status === 400 || status === 422) return "اطلاعات واردشده معتبر نیست. لطفاً فیلدها را بررسی کنید.";
  if (status === 401) return path.endsWith("/login") ? "شماره موبایل یا رمز عبور صحیح نیست." : "نشست شما پایان یافته است. دوباره وارد شوید.";
  if (status === 403) return "دسترسی به این بخش مجاز نیست.";
  if (status === 409) return "این شماره موبایل قبلاً ثبت شده است.";
  if (status === 429) return "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.";
  return "سرویس در دسترس نیست. کمی بعد دوباره تلاش کنید.";
}
async function request(path: string, init: RequestInit): Promise<AuthPayload> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: requestSignal(init.signal), credentials: "omit", cache: "no-store",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new AuthApiError("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.", 0);
  }
  const body: unknown = await response.json().catch(() => null);
  const payload = isRecord(body) ? body : {};
  if (!response.ok) {
    const errors = fieldErrors(payload);
    if (response.status === 409) errors.mobile = "این شماره موبایل قبلاً ثبت شده است.";
    throw new AuthApiError(errorMessage(response.status, payload, path), response.status, errors);
  }
  if (!isRecord(body)) throw new AuthApiError("پاسخ معتبر از سرویس دریافت نشد.", 502);
  return payload;
}
export async function getCountries(signal?: AbortSignal): Promise<Country[]> {
  const payload = await request("/Common/v1/Countries/List", { method: "GET", signal });
  if (!Array.isArray(payload.data) || !payload.data.length || !payload.data.every(country => isRecord(country) && Number.isSafeInteger(country.id) && (country.id as number) > 0 &&
    typeof country.name === "string" && typeof country.isoCode === "string" && /^[A-Z]{2}$/.test(country.isoCode) && typeof country.phoneCode === "string" && /^\+\d{1,4}$/.test(country.phoneCode)))
    throw new AuthApiError("فهرست کشورها دریافت نشد.", 502);
  return payload.data as Country[];
}
export async function requestPasswordReset(countryId: number, mobile: string, signal?: AbortSignal): Promise<{ expiresInSeconds: number }> {
  const payload = await request("/api/v1/auth/forgot-password/request", { method: "POST", body: JSON.stringify({ countryId, mobile }), signal });
  const data = payload.data;
  if (!isRecord(data) || !Number.isSafeInteger(data.expiresInSeconds) || (data.expiresInSeconds as number) <= 0) throw new AuthApiError("اعتبار کد دریافت نشد.", 502);
  return data as { expiresInSeconds: number };
}
export async function verifyPasswordReset(countryId: number, mobile: string, code: string, signal?: AbortSignal): Promise<{ resetToken: string; expiresInSeconds: number }> {
  const payload = await request("/api/v1/auth/forgot-password/verify", { method: "POST", body: JSON.stringify({ countryId, mobile, code }), signal });
  const data = payload.data;
  if (!isRecord(data) || typeof data.resetToken !== "string" || !/^[a-f0-9]{64}$/i.test(data.resetToken) || !Number.isSafeInteger(data.expiresInSeconds) || (data.expiresInSeconds as number) <= 0)
    throw new AuthApiError("مجوز تغییر رمز معتبر نیست.", 502);
  return data as { resetToken: string; expiresInSeconds: number };
}
export async function resetPassword(countryId: number, mobile: string, resetToken: string, password: string, confirmPassword: string, signal?: AbortSignal): Promise<void> {
  const payload = await request("/api/v1/auth/forgot-password/reset", { method: "POST", body: JSON.stringify({ countryId, mobile, resetToken, password, confirmPassword }), signal });
  if (!isRecord(payload.data) || payload.data.passwordChanged !== true) throw new AuthApiError("تغییر رمز انجام نشد.", 502);
}
export async function getRoles(signal?: AbortSignal): Promise<RoleOption[]> {
  const payload = await request("/api/v1/auth/roles", { method: "GET", signal });
  if (!Array.isArray(payload.data) || !payload.data.length) throw new AuthApiError("لیست نوع حساب دریافت نشد.", 502);
  return payload.data.map(value => {
    if (!isRecord(value) || !Number.isSafeInteger(value.id) || typeof value.value !== "string" || typeof value.label !== "string" || !value.label.trim()) {
      throw new AuthApiError("لیست نوع حساب معتبر نیست.", 502);
    }
    const role = value.value.toLowerCase();
    if (role !== "client" && role !== "agent") throw new AuthApiError("نوع حساب پشتیبانی نمی‌شود.", 502);
    return { id: value.id as number, value: role, label: value.label };
  });
}
async function authenticate(path: string, values: object, rememberMe: boolean): Promise<AuthUser> {
  clearSession(); const operation = revision;
  const payload = await request(path, { method: "POST", body: JSON.stringify(values) });
  if (revision !== operation) throw new AuthApiError("عملیات ورود لغو شد. دوباره تلاش کنید.", 401);
  const session = asSession(payload.data);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new AuthApiError("پاسخ معتبر از سرویس احراز هویت دریافت نشد.", 502);
  saveSession(session, rememberMe);
  return session.user;
}
export async function login(mobile: string, password: string, rememberMe = false, countryId = 105): Promise<AuthUser> {
  return authenticate("/api/v1/auth/login", { countryId, mobile, password }, rememberMe);
}
export async function register(values: Registration): Promise<AuthUser> {
  return authenticate("/api/v1/auth/register", { ...values, role: values.role === "agent" ? "Agent" : "Client" }, false);
}
async function refreshedSession(rejectedToken?: string): Promise<AuthSession> {
  const existing = currentSession();
  if (rejectedToken ? existing.token !== rejectedToken : Date.parse(existing.expiresAt) > Date.now() + refreshWindow) return existing;
  if (refreshWork?.revision === revision) return refreshWork.promise;
  const operation = revision;
  const refresh = async () => {
    if (revision !== operation) throw new AuthApiError("نشست تغییر کرده است. دوباره تلاش کنید.", 401);
    const session = currentSession();
    // Another tab may have rotated the tokens while this tab waited for the lock.
    if (session.refreshToken !== existing.refreshToken && Date.parse(session.expiresAt) > Date.now()) return session;
    try {
      const payload = await request("/api/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: session.refreshToken }) });
      if (revision !== operation) throw new AuthApiError("نشست تغییر کرده است. دوباره تلاش کنید.", 401);
      const next = asSession(payload.data);
      if (!next || next.user.id !== session.user.id || Date.parse(next.expiresAt) <= Date.now()) throw new AuthApiError("پاسخ تمدید نشست معتبر نیست.", 502);
      saveSession(next, session.rememberMe); emit(sessionChangedEvent);
      return { ...next, rememberMe: session.rememberMe };
    } catch (error) {
      if (revision === operation && error instanceof AuthApiError && [400, 401, 403].includes(error.status)) {
        const latest = currentSession();
        if (latest.refreshToken !== session.refreshToken && latest.user.id === session.user.id && Date.parse(latest.expiresAt) > Date.now()) return latest;
        expireSession();
      }
      throw error;
    }
  };
  const promise = Promise.resolve(typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("ticketino:auth-refresh", refresh) : refresh());
  const work = { revision: operation, promise };
  refreshWork = work;
  try { return await promise; }
  finally { if (refreshWork === work) refreshWork = null; }
}
export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  signal?.throwIfAborted();
  const session = await refreshedSession();
  signal?.throwIfAborted();
  return session.user;
}
export async function logout(): Promise<void> { clearSession(); }
export function updateSessionProfile(value: unknown): AuthUser {
  const session = currentSession(); const user = asUser(value);
  if (!user || user.id !== session.user.id || user.role !== session.user.role) throw new AuthApiError("پروفایل معتبر نیست.", 502);
  saveSession({ ...session, user }, session.rememberMe); emit(sessionChangedEvent); return user;
}

/** SignalR shares the protected HTTP token rotation coordinator. */
export async function realtimeAccessToken(expectedUserId: number): Promise<string> {
  const session = await refreshedSession();
  if (session.user.id !== expectedUserId) throw new AuthApiError("نشست تغییر کرده است.", 401);
  return session.token;
}

/** Proactively refresh, or retry a protected request once after a 401. */
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const normalized = new URL(path, "http://ticketino.local");
  if (!path.startsWith("/Tickets/v1/") || !normalized.pathname.startsWith("/Tickets/v1/") || path.includes("\\") || path.includes("..")) throw new AuthApiError("مسیر درخواست معتبر نیست.", 400);
  init.signal?.throwIfAborted();
  let session: AuthSession;
  try { session = await refreshedSession(); }
  catch (error) { if (error instanceof AuthApiError && error.status === 401) emit(sessionExpiredEvent); throw error; }
  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`); headers.set("Accept", "application/json");
    try {
      return await fetch(path, { ...init, headers, credentials: "omit", cache: "no-store", signal: requestSignal(init.signal, init.body instanceof FormData || path.includes("/Attachments/") ? 120_000 : 15_000), redirect: "error" });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new AuthApiError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.", 0);
    }
  };
  const operation = revision;
  let response = await send(session.token);
  if (response.status === 401) {
    if (revision !== operation) throw new AuthApiError("نشست تغییر کرده است. دوباره تلاش کنید.", 401);
    session = await refreshedSession(session.token);
    init.signal?.throwIfAborted();
    response = await send(session.token);
    if (response.status === 401) {
      if (currentSession().token === session.token) expireSession();
      throw new AuthApiError("نشست شما پایان یافته است. دوباره وارد شوید.", 401);
    }
  }
  return response;
}
export function homeForRole(role: UserRole): string { return role === "agent" ? "/support/dashboard" : "/client/dashboard"; }
export function authErrorMessage(error: unknown): string { return error instanceof AuthApiError ? error.message : "خطایی رخ داد. لطفاً دوباره تلاش کنید."; }
