"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

type Pan = { x: number; y: number };
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
function cropRect(image: ImageBitmap, zoom: number, pan: Pan) {
  const size = Math.min(image.width, image.height) / zoom;
  return { x: (image.width - size) / 2 * (1 + pan.x), y: (image.height - size) / 2 * (1 + pan.y), size };
}

export function AvatarCropper({ file, onComplete, onCancel }: {
  file: File; onComplete: (cropped: File) => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const busy = useRef(false);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  useEffect(() => {
    alive.current = true;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal(); viewport.current?.focus();
    return () => { alive.current = false; element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    let disposed = false;
    let bitmap: ImageBitmap | undefined;
    // Decode once: the preview and exported crop use the same oriented, still image.
    void createImageBitmap(file, { imageOrientation: "from-image" }).then(value => {
      if (disposed) { value.close(); return; }
      bitmap = value; setImage(value);
    }).catch(() => { if (!disposed) setError("خواندن عکس ممکن نشد. عکس دیگری انتخاب کنید."); });
    return () => { disposed = true; bitmap?.close(); };
  }, [file]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !image) return;
    const rect = cropRect(image, zoom, pan);
    context.clearRect(0, 0, 512, 512);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, 512, 512);
  }, [image, zoom, pan]);

  function moveImage(dx: number, dy: number) {
    if (!image || busy.current) return;
    const pixels = viewport.current?.getBoundingClientRect().width || 300;
    const size = Math.min(image.width, image.height) / zoom;
    setPan(previous => ({
      x: image.width > size ? clamp(previous.x - dx / pixels * size * 2 / (image.width - size)) : 0,
      y: image.height > size ? clamp(previous.y - dy / pixels * size * 2 / (image.height - size)) : 0,
    }));
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!image || busy.current || event.button !== 0 || drag.current) return;
    event.preventDefault(); event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const previous = drag.current;
    if (!previous || previous.id !== event.pointerId) return;
    moveImage(event.clientX - previous.x, event.clientY - previous.y);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function confirm() {
    if (!image || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const rect = cropRect(image, zoom, pan);
      const output = document.createElement("canvas");
      output.width = output.height = Math.max(1, Math.min(512, Math.floor(rect.size)));
      const context = output.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, output.width, output.height);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("Crop failed")), "image/png"));
      if (alive.current) onComplete(new File([blob], "profile-cropped.png", { type: "image/png" }));
    } catch { if (alive.current) setError("برش عکس انجام نشد. دوباره تلاش کنید."); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return <dialog ref={dialog} className="avatar-crop-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} dir="rtl"
    onCancel={event => { event.preventDefault(); if (!busy.current) onCancel(); }}>
    <div className="avatar-crop-heading"><h2 id={`${id}-title`}>برش عکس پروفایل</h2><button type="button" className="avatar-crop-close" aria-label="بستن پنجره برش" disabled={pending} onClick={onCancel}><span aria-hidden="true">×</span></button></div>
    <p id={`${id}-help`} className="avatar-crop-help">عکس را جابه‌جا کنید و اندازهٔ آن را تنظیم کنید. بخش داخل دایره در پروفایل نمایش داده می‌شود.</p>
    <div ref={viewport} className="avatar-crop-viewport" tabIndex={0} role="group" aria-label="جابه‌جایی عکس؛ با کشیدن یا کلیدهای جهت‌دار"
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const step = event.shiftKey ? 20 : 5;
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (delta[event.key]) { event.preventDefault(); moveImage(...delta[event.key]); }
      }}>
      <canvas ref={canvas} width={512} height={512} aria-hidden="true" />
      <div className="avatar-crop-mask" aria-hidden="true" />
      {!image && !error && <span className="avatar-crop-loading" role="status">در حال آماده‌سازی عکس…</span>}
    </div>
    <div className="avatar-crop-zoom"><label htmlFor={`${id}-zoom`}>بزرگ‌نمایی</label><output htmlFor={`${id}-zoom`}>{Math.round(zoom * 100).toLocaleString("fa-IR")}٪</output>
      <input id={`${id}-zoom`} type="range" min={1} max={4} step={0.01} value={zoom} disabled={!image || pending} dir="ltr" onChange={event => setZoom(Number(event.target.value))} />
    </div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="avatar-crop-actions"><button type="button" className="primary-button compact-button" disabled={!image || pending} aria-busy={pending} onClick={() => void confirm()}>{pending ? "در حال آماده‌سازی…" : "تأیید برش"}</button>
      <button type="button" className="avatar-crop-secondary" disabled={pending} onClick={onCancel}>انصراف</button>
      <button type="button" className="avatar-crop-reset" disabled={!image || pending} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>بازنشانی</button>
    </div>
  </dialog>;
}
