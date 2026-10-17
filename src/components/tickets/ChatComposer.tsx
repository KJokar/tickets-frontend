"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChatIcon } from "./ChatIcon";

type DraftMedia = { id: string; file: File; url: string; voice: boolean };
const maxBytes = 20 * 1024 * 1024;
function duration(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

export function ChatComposer({ ticketId, value, onChange, onSend, sending, disabled, onTyping }: {
  ticketId: number; value: string; onChange: (value: string) => void; onSend: (files: File[]) => Promise<boolean>;
  sending: boolean; disabled: boolean; onTyping?: (typing: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<DraftMedia[]>([]);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<DraftMedia[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const discardRecording = useRef(false);
  const active = useRef(false);
  const micRequest = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingCallback = useRef(onTyping);
  useEffect(() => { typingCallback.current = onTyping; }, [onTyping]);
  useEffect(() => {
    active.current = true;
    const requestState = micRequest;
    return () => {
      active.current = false; ++requestState.current; discardRecording.current = true;
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      draftRef.current.forEach(draft => URL.revokeObjectURL(draft.url));
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingCallback.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => { if (recording && seconds >= 120) recorder.current?.stop(); }, [recording, seconds]);

  function replaceDrafts(next: DraftMedia[]) { draftRef.current = next; setDrafts(next); }
  function addFiles(files: File[], voice = false) {
    if ([...draftRef.current.map(draft => draft.file), ...files].reduce((sum, file) => sum + file.size, 0) > maxBytes) { setError("مجموع حجم پیوست‌ها باید حداکثر ۲۰ مگابایت باشد."); return; }
    const remaining = 5 - draftRef.current.length;
    const valid = files.filter(file => file.size > 0 && file.size <= maxBytes);
    if (valid.length !== files.length) setError("فایل باید خالی نباشد و حداکثر ۲۰ مگابایت حجم داشته باشد.");
    else if (files.length > remaining) setError("در هر نوبت حداکثر ۵ پیوست انتخاب کنید.");
    else setError("");
    const added = valid.slice(0, remaining).map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), voice }));
    replaceDrafts([...draftRef.current, ...added]);
  }
  function removeDraft(id: string) {
    const item = draftRef.current.find(draft => draft.id === id);
    if (item) URL.revokeObjectURL(item.url);
    replaceDrafts(draftRef.current.filter(draft => draft.id !== id));
  }
  function selectFiles(event: ChangeEvent<HTMLInputElement>) { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }
  async function startRecording() {
    if (sending || disabled || requestingMic || recording) return;
    if (draftRef.current.length >= 5) { setError("ابتدا یکی از پیوست‌ها را حذف کنید."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("ضبط ویس در این مرورگر در دسترس نیست."); return; }
    const request = ++micRequest.current; setRequestingMic(true); setError("");
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current || micRequest.current !== request) { audioStream.getTracks().forEach(track => track.stop()); return; }
      stream.current = audioStream; discardRecording.current = false;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder; const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onerror = () => { discardRecording.current = true; audioStream.getTracks().forEach(track => track.stop()); if (active.current) { setRecording(false); setError("ضبط صدا انجام نشد. دوباره تلاش کنید."); } };
      mediaRecorder.onstop = () => {
        audioStream.getTracks().forEach(track => track.stop());
        if (!active.current) return;
        setRecording(false);
        if (!discardRecording.current && chunks.length) {
          const type = mediaRecorder.mimeType || "audio/webm";
          addFiles([new File(chunks, `voice-${Date.now()}.${type.includes("mp4") ? "m4a" : "weba"}`, { type })], true);
        }
      };
      mediaRecorder.start(250); setSeconds(0); setRecording(true);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop());
      if (active.current && micRequest.current === request) setError(error instanceof DOMException && error.name === "NotAllowedError" ? "برای ضبط ویس، دسترسی میکروفن را در مرورگر فعال کنید." : "میکروفن در دسترس نیست. اتصال آن را بررسی کنید.");
    } finally { if (active.current && micRequest.current === request) setRequestingMic(false); }
  }
  function stopRecording(discard = false) { discardRecording.current = discard; if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); }
  function changeText(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value; onChange(text);
    event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
    typingCallback.current?.(!!text.trim());
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => typingCallback.current?.(false), 1800);
  }
  async function send() {
    if (disabled || sending || recording || requestingMic || !draftRef.current.length && !value.trim()) return;
    typingCallback.current?.(false);
    const sent = await onSend(draftRef.current.map(draft => draft.file));
    if (sent && active.current) {
      draftRef.current.forEach(draft => URL.revokeObjectURL(draft.url)); replaceDrafts([]);
      if (textarea.current) textarea.current.style.height = "auto";
    }
  }
  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
  }
  return <div className="chat-composer">
    {drafts.length > 0 && <div className="chat-draft-tray" aria-label="پیش‌نمایش پیوست‌ها">
      <div className="chat-draft-caption"><ChatIcon name="attach" size={15} /><span>پیوست‌های پیام · آماده ارسال</span></div>
      <div className="chat-draft-items">{drafts.map(draft => <div className={`chat-media-draft${draft.voice ? " voice-draft" : ""}`} key={draft.id}>
        <button className="chat-draft-remove" type="button" disabled={sending || disabled} aria-label={`حذف ${draft.voice ? "ویس" : draft.file.name}`} onClick={() => removeDraft(draft.id)}><ChatIcon name="close" size={14} /></button>
        {draft.file.type.startsWith("image/") ? /* Blob URLs are local previews, not remote images. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.url} alt={draft.file.name} />
          : draft.file.type.startsWith("video/") ? <video src={draft.url} controls preload="metadata" aria-label={draft.file.name} />
          : draft.file.type.startsWith("audio/") ? <audio src={draft.url} controls preload="metadata" aria-label={draft.voice ? "پیش‌نمایش ویس ضبط شده" : draft.file.name} />
          : <div className="chat-file-preview"><ChatIcon name="file" size={27} /></div>}
        <div className="chat-draft-name"><span>{draft.voice ? "پیام صوتی" : draft.file.name}</span><small>{(draft.file.size / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 0 })} کیلوبایت</small></div>
      </div>)}</div>
    </div>}
    {error && <p className="chat-composer-error" role="alert">{error}</p>}
    {recording ? <div className="chat-recording-bar" role="status">
      <button className="chat-icon-button" type="button" onClick={() => stopRecording(true)} aria-label="لغو ضبط ویس"><ChatIcon name="close" /></button>
      <span className="chat-recording-dot" /><span className="chat-recording-label">در حال ضبط</span><time dir="ltr">{duration(seconds)}</time>
      <span className="chat-waveform" aria-hidden="true">{[12,24,16,30,20,34,16,26,12,22,30,18].map((height,index) => <i key={index} style={{ height, animationDelay: `${index * 90}ms` }} />)}</span>
      <button className="chat-record-stop" type="button" onClick={() => stopRecording()} aria-label="پایان ضبط ویس"><ChatIcon name="stop" size={17} />پایان ضبط</button>
    </div> : <form className="chat-input-row" onSubmit={event => { event.preventDefault(); send(); }} aria-busy={sending}>
      <div className="chat-composer-tools">
        <input ref={fileInput} type="file" multiple accept="image/*,video/*,audio/*,application/pdf" onChange={selectFiles} hidden tabIndex={-1} aria-label="انتخاب مدیا" disabled={disabled || sending || requestingMic} />
        <button className="chat-icon-button" type="button" title="افزودن فایل یا مدیا" aria-label="افزودن فایل یا مدیا" disabled={disabled || sending || requestingMic} onClick={() => fileInput.current?.click()}><ChatIcon name="attach" /></button>
        <button className={`chat-icon-button${requestingMic ? " is-waiting" : ""}`} type="button" title="ضبط ویس" aria-label="ضبط ویس" disabled={disabled || sending || requestingMic} onClick={() => void startRecording()}><ChatIcon name="mic" /></button>
      </div>
      <label className="sr-only" htmlFor={`ticket-reply-${ticketId}`}>پیام شما</label>
      <textarea ref={textarea} id={`ticket-reply-${ticketId}`} rows={1} value={value} onChange={changeText} onKeyDown={keyboard} onBlur={() => typingCallback.current?.(false)} placeholder="پیامتان را بنویسید…" maxLength={4000} disabled={disabled || sending || requestingMic} dir="auto" />
      <button className="chat-send-button" type="submit" aria-label="ارسال پیام" title="ارسال پیام و پیوست‌ها" disabled={disabled || sending || requestingMic || !drafts.length && !value.trim()}>{sending ? <span className="chat-spinner" /> : <ChatIcon name="send" size={21} />}</button>
    </form>}
    <div className="chat-composer-footnote"><span>{recording ? "حداکثر زمان ضبط: ۲ دقیقه" : sending && drafts.length ? "در حال آپلود و ارسال…" : drafts.length ? "حداکثر ۵ پیوست با مجموع حجم ۲۰ مگابایت" : "گفت‌وگو با پشتیبانی"}</span><span className="chat-keyboard-hint">Enter ارسال · Shift + Enter خط جدید</span></div>
  </div>;
}
