/* eslint-disable @next/next/no-img-element -- Local blob previews do not use the image optimizer. */
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChatIcon } from "./ChatIcon";

export function mediaSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت`
    : `${Math.max(1, Math.ceil(bytes / 1024)).toLocaleString("fa-IR")} کیلوبایت`;
}
export function MediaPreview({ url, type, name }: { url: string; type: string; name: string }) {
  if (type.startsWith("image/") && !type.startsWith("image/hei")) return <img className="ticket-media-image" src={url} alt={name} loading="lazy" />;
  if (type.startsWith("video/")) return <video className="ticket-media-video" src={url} controls preload="metadata" aria-label={name} />;
  if (type.startsWith("audio/")) return <audio className="ticket-media-audio" src={url} controls preload="metadata" aria-label={name} />;
  return <span className="ticket-media-file"><ChatIcon name="file" size={28} /><span>{type === "application/pdf" ? "PDF" : "فایل پیوست"}</span></span>;
}

type Draft = { id: string; file: File; url: string };
const accepted = ".jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif,.mp4,.mov,.webm,.weba,.mp3,.m4a,.wav,.ogg,.pdf";
export function TicketMediaPicker({ disabled, onChange }: { disabled: boolean; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const current = urls.current;
    return () => { current.forEach(url => URL.revokeObjectURL(url)); current.clear(); };
  }, []);
  function add(files: File[]) {
    if (disabled || !files.length) return;
    if (drafts.length + files.length > 5) { setError("حداکثر ۵ فایل می‌توانید پیوست کنید."); return; }
    if (files.some(file => !file.size)) { setError("فایل خالی قابل ارسال نیست."); return; }
    if (files.some(file => !accepted.split(",").includes(`.${file.name.split(".").pop()?.toLowerCase()}`))) { setError("عکس، ویدئو، صدا یا PDF انتخاب کنید."); return; }
    if ([...drafts.map(draft => draft.file), ...files].reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { setError("مجموع حجم پیوست‌ها نباید بیشتر از ۲۰ مگابایت باشد."); return; }
    const next = [...drafts, ...files.map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: crypto.randomUUID(), file, url }; })];
    setError(""); setDrafts(next); onChange(next.map(draft => draft.file));
  }
  function remove(id: string) {
    const removed = drafts.find(draft => draft.id === id);
    if (removed) { URL.revokeObjectURL(removed.url); urls.current.delete(removed.url); }
    const next = drafts.filter(draft => draft.id !== id);
    setDrafts(next); onChange(next.map(draft => draft.file)); setError("");
  }
  return <section className="ticket-media-picker" aria-labelledby={`${id}-label`}>
    <div className="new-ticket-label"><span id={`${id}-label`}>پیوست‌ها <small>اختیاری</small></span><span>{drafts.length.toLocaleString("fa-IR")} / ۵</span></div>
    <div className={`ticket-media-drop${dragging ? " is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}>
      <ChatIcon name="file" size={24} /><div><strong>عکس، ویدئو، صدا یا PDF</strong><p id={`${id}-hint`}>فایل‌ها را اینجا رها کنید؛ حداکثر ۵ فایل، مجموعاً ۲۰ مگابایت.</p></div>
      <button className="ticket-media-choose" type="button" disabled={disabled || drafts.length >= 5} onClick={() => input.current?.click()}>انتخاب فایل</button>
      <input ref={input} type="file" multiple accept={accepted} disabled={disabled} hidden aria-label="انتخاب پیوست درخواست" aria-describedby={`${id}-hint`} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!!drafts.length && <div className="ticket-media-drafts">{drafts.map(draft => <div className="ticket-media-card" key={draft.id}>
      <MediaPreview url={draft.url} type={draft.file.type} name={draft.file.name} />
      <div className="ticket-media-caption"><span title={draft.file.name}>{draft.file.name}<small>{mediaSize(draft.file.size)}</small></span><button type="button" disabled={disabled} onClick={() => remove(draft.id)} aria-label={`حذف پیوست ${draft.file.name}`}><ChatIcon name="close" size={16} /></button></div>
    </div>)}</div>}
  </section>;
}
