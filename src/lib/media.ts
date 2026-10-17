import { authenticatedFetch, AuthApiError, updateSessionProfile, type AuthUser } from "./auth";

export type MediaReference = { receipt: string };
export function cdnUrl(path?: string | null): string | undefined {
  if (!path || !path.startsWith("/users/avatars/") || path.includes("..") || path.includes("\\")) return undefined;
  return (process.env.NEXT_PUBLIC_CDN_ORIGIN || "http://localhost:5083").replace(/\/$/, "") + path;
}
async function mediaRequest(path: string, init: RequestInit = {}) {
  const response = await authenticatedFetch(`/Tickets/v1/${path}`, { ...init, headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.data) throw new AuthApiError(result?.message || "ارتباط با سرویس فایل برقرار نشد.", response.status);
  return result.data;
}
export async function uploadMedia(files: File[], category: "UserAvatar" | "MessageAttachment", ticketId?: number): Promise<MediaReference[]> {
  if (!files.length) return [];
  const max = category === "UserAvatar" ? 5 : 20;
  if (files.length > (category === "UserAvatar" ? 1 : 5) || files.some(file => !file.size) || files.reduce((sum, file) => sum + file.size, 0) > max * 1024 * 1024)
    throw new AuthApiError(`حجم یا تعداد فایل‌ها مجاز نیست. حداکثر حجم مجموع فایل‌ها ${max.toLocaleString("fa-IR")} مگابایت است.`, 400);
  const grant = await mediaRequest("Media/Uploads", { method: "POST", body: JSON.stringify({ category, ...(ticketId ? { ticketId } : {}) }) });
  const origin = new URL(process.env.NEXT_PUBLIC_CDN_ORIGIN || "http://localhost:5083").origin;
  if (typeof grant.token !== "string" || typeof grant.uploadUrl !== "string" || new URL(grant.uploadUrl).origin !== origin)
    throw new AuthApiError("نشانی سرویس فایل معتبر نیست.", 502);
  const form = new FormData(); files.forEach(file => form.append("files", file, file.name));
  let response: Response;
  try {
    response = await fetch(grant.uploadUrl, { method: "POST", body: form, headers: { Authorization: `Bearer ${grant.token}` }, signal: AbortSignal.timeout(120_000), credentials: "omit", redirect: "error" });
  } catch { throw new AuthApiError("آپلود فایل انجام نشد. اتصال به سرویس فایل را بررسی و دوباره تلاش کنید.", 0); }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 0 || !Array.isArray(result.result) || result.result.length !== files.length || !result.result.every((file: { receipt?: unknown }) => typeof file?.receipt === "string"))
    throw new AuthApiError(result?.message || "پاسخ سرویس فایل معتبر نیست.", response.status || 502);
  return result.result.map((file: { receipt: string }) => ({ receipt: file.receipt }));
}
export async function getProfile(signal?: AbortSignal): Promise<AuthUser> { return updateSessionProfile(await mediaRequest("Profile", { signal })); }
export async function updateProfile(fullName: string): Promise<AuthUser> {
  return updateSessionProfile(await mediaRequest("Profile", { method: "PATCH", body: JSON.stringify({ fullName }) }));
}
export async function setAvatar(file: File): Promise<AuthUser> {
  const [reference] = await uploadMedia([file], "UserAvatar");
  return updateSessionProfile(await mediaRequest("Profile/Avatar", { method: "PUT", body: JSON.stringify(reference) }));
}
export async function deleteAvatar(): Promise<AuthUser> { return updateSessionProfile(await mediaRequest("Profile/Avatar", { method: "DELETE" })); }
