"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage } from "@/lib/auth";
import { cdnUrl, deleteAvatar, getProfile, setAvatar, updateProfile } from "@/lib/media";
import { AvatarCropper } from "./AvatarCropper";

function avatarFileError(file: File) {
  return !file.size || file.size > 5 * 1024 * 1024 || !/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)
    ? "یک عکس PNG، JPEG، WebP، GIF یا AVIF با حداکثر حجم ۵ مگابایت انتخاب کنید." : "";
}

export function ProfileView() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const localUrl = useRef<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null); const userId = user?.id;
  useEffect(() => {
    const controller = new AbortController();
    void getProfile(controller.signal).catch(error => { if (!controller.signal.aborted) setError(authErrorMessage(error)); });
    return () => controller.abort();
  }, [userId]);
  useEffect(() => () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);
  function select(value: File | null) {
    setError(""); setSuccess("");
    if (value && avatarFileError(value)) { setError(avatarFileError(value)); return; }
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = value ? URL.createObjectURL(value) : undefined;
    setPreview(localUrl.current); setFile(value);
    if (!value) setOriginalFile(null);
  }
  function choose(value: File | null) {
    if (!value) return;
    setError(""); setSuccess("");
    const message = avatarFileError(value);
    if (message) { setError(message); return; }
    setCropSource(value);
  }
  async function save(remove = false) {
    if (pending || !remove && !file) return;
    setPending(true); setError(""); setSuccess("");
    try { if (remove) await deleteAvatar(); else await setAvatar(file!); select(null); setSuccess(remove ? "تصویر پروفایل حذف شد." : "تصویر پروفایل ذخیره شد."); }
    catch (error) { setError(authErrorMessage(error)); }
    finally { setPending(false); }
  }
  const image = preview || cdnUrl(user?.avatarUrl);
  return <div className="profile-page">
    <div className="page-heading"><div><p className="eyebrow">حساب کاربری</p><h1>پروفایل من</h1></div></div>
    <section className="profile-card">
      <div className="profile-photo">{image ?
        // eslint-disable-next-line @next/next/no-img-element -- CDN and local preview URLs.
        <img src={image} alt="تصویر پروفایل" /> : <span>{user?.fullName.slice(0, 1)}</span>}</div>
      <div className="profile-copy"><h2>{user?.fullName}</h2><p dir="ltr">{user?.mobile}</p><span>{user?.role === "agent" ? "کارشناس پشتیبانی" : "مشتری"}</span></div>
      {user && <ProfileNameForm key={user.id} fullName={user.fullName} />}
      <div className="profile-upload"><h3>تصویر پروفایل</h3><p>عکس دلخواهتان را انتخاب کنید؛ حداکثر حجم ۵ مگابایت.</p>
        <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="انتخاب تصویر پروفایل" disabled={pending} onChange={event => { choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        <div className="profile-actions"><button className="primary-button compact-button" type="button" disabled={pending} onClick={() => input.current?.click()}>انتخاب عکس</button>
          {file && <><button className="primary-button compact-button" type="button" disabled={pending} onClick={() => void save()}>{pending ? "در حال آپلود…" : "ذخیره تصویر"}</button><button className="text-link" type="button" disabled={pending} onClick={() => setCropSource(originalFile ?? file)}>برش دوباره</button><button className="text-link" type="button" disabled={pending} onClick={() => select(null)}>انصراف</button></>}
          {user?.avatarUrl && !file && <button className="text-link" type="button" disabled={pending} onClick={() => void save(true)}>حذف تصویر</button>}
        </div>
      </div>
      {error && <p className="notice error-notice" role="alert">{error}</p>}{success && <p className="profile-success" role="status">{success}</p>}
    </section>
    {cropSource && <AvatarCropper file={cropSource} onCancel={() => setCropSource(null)} onComplete={cropped => { select(cropped); setOriginalFile(cropSource); setCropSource(null); }} />}
  </div>;
}

function ProfileNameForm({ fullName }: { fullName: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? fullName;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || name.trim() === fullName) return;
    setError(""); setSuccess("");
    const value = name.trim();
    if (value.length < 2 || value.length > 150) { setError("نام باید بین ۲ تا ۱۵۰ کاراکتر باشد."); return; }
    setPending(true);
    try {
      await updateProfile(value);
      setDraft(null); setSuccess("نام شما ذخیره شد.");
    } catch (error) { setError(authErrorMessage(error)); }
    finally { setPending(false); }
  }
  return <form className="profile-details-form" onSubmit={save}>
    <div className="form-field"><label htmlFor="profile-full-name">نام و نام خانوادگی</label>
      <input id="profile-full-name" name="fullName" autoComplete="name" required minLength={2} maxLength={150} value={name} disabled={pending}
        aria-invalid={!!error} aria-describedby={error ? "profile-name-error" : undefined}
        onChange={event => { setDraft(event.target.value); setError(""); setSuccess(""); }} />
    </div>
    <button className="primary-button compact-button" type="submit" disabled={pending || name.trim() === fullName} aria-busy={pending}>{pending ? "در حال ذخیره…" : "ذخیره نام"}</button>
    {error && <p id="profile-name-error" className="notice error-notice" role="alert">{error}</p>}
    {success && <p className="profile-success" role="status">{success}</p>}
  </form>;
}
