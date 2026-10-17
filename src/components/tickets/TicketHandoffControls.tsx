"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { getTransferAgents, ticketErrorMessage, type TransferAgent, type TransferAgentPage } from "@/lib/tickets";
import { UserAvatar } from "@/components/profile/UserAvatar";

type Props = { ticketId: number; busy: boolean; pending: boolean; error: string; onHandoff: (agentId?: number) => Promise<boolean> };

export function TicketHandoffControls(props: Props) {
  const [mode, setMode] = useState<"transfer" | "release" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const releaseTrigger = useRef<HTMLButtonElement>(null);
  function close() {
    if (props.pending) return;
    (mode === "transfer" ? trigger : releaseTrigger).current?.focus();
    setMode(null);
  }
  return <div className="chat-handoff-controls">
    <button ref={trigger} className="chat-handoff-button" type="button" disabled={props.busy} onClick={() => setMode("transfer")}>ارجاع به پشتیبان دیگر</button>
    <button ref={releaseTrigger} className="chat-handoff-button secondary" type="button" disabled={props.busy} onClick={() => setMode("release")}>بازگرداندن به صف عمومی</button>
    {mode && <HandoffDialog {...props} mode={mode} onClose={close} />}
  </div>;
}

function HandoffDialog({ ticketId, mode, busy, pending, error, onHandoff, onClose }: Props & { mode: "transfer" | "release"; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const [selected, setSelected] = useState<TransferAgent | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || mode === "transfer" && !selected) return;
    if (await onHandoff(mode === "transfer" ? selected!.id : undefined)) onClose();
  }
  return <dialog ref={dialog} className="ticket-handoff-dialog" aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={submit}>
      <div className="handoff-heading"><h2 id={headingId}>{mode === "transfer" ? "ارجاع درخواست" : "بازگرداندن به صف عمومی"}</h2><button type="button" aria-label="بستن" disabled={pending} onClick={onClose}>×</button></div>
      <p id={descriptionId}>{mode === "transfer" ? "پشتیبان جدید ادامه گفت‌وگو را همراه با تمام پیام‌های قبلی دریافت می‌کند. پس از ارجاع، درخواست از فهرست شما خارج می‌شود." : "مسئولیت شما از این درخواست برداشته می‌شود و وضعیت آن به «باز» تغییر می‌کند تا هر پشتیبانی بتواند آن را بپذیرد. پیام‌های قبلی حفظ می‌شوند."}</p>
      {mode === "transfer" && <AgentPicker ticketId={ticketId} selected={selected} onSelect={setSelected} disabled={busy} />}
      {selected && <p className="handoff-selection">پشتیبان جدید: <strong>{selected.displayName}</strong> · <bdi dir="ltr">{selected.mobile}</bdi></p>}
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      <div className="handoff-footer"><button type="button" className="chat-cancel-button" disabled={pending} onClick={onClose}>انصراف</button><button type="submit" className="primary-button compact-button" disabled={busy || mode === "transfer" && !selected}>
        {pending ? "در حال واگذاری…" : mode === "transfer" ? "ارجاع درخواست" : "بازگرداندن به صف"}
      </button></div>
    </form>
  </dialog>;
}

function AgentPicker({ ticketId, selected, onSelect, disabled }: { ticketId: number; selected: TransferAgent | null; onSelect: (value: TransferAgent | null) => void; disabled: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const searchId = useId();
  const [result, setResult] = useState<{ key: string; data?: TransferAgentPage; error?: string } | null>(null);
  const key = JSON.stringify([ticketId, search, page, attempt]);
  const loading = result?.key !== key;
  const data = !loading ? result?.data : null;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void getTransferAgents(ticketId, search, page, controller.signal)
        .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
        .catch(error => { if (!controller.signal.aborted) setResult({ key, error: ticketErrorMessage(error) }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ticketId, search, page, key]);
  return <div className="handoff-agent-picker">
    <label htmlFor={searchId}>جست‌وجوی نام یا شماره پشتیبان</label><input id={searchId} type="search" value={search} maxLength={150} disabled={disabled}
      onChange={event => { setSearch(event.target.value); setPage(1); onSelect(null); }} placeholder="نام یا شماره موبایل…" />
    {loading && <p role="status">در حال دریافت پشتیبان‌ها…</p>}
    {!loading && result?.error && <p className="notice error-notice" role="alert">{result.error} <button type="button" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button></p>}
    {data && <>
      <div className="handoff-agents" role="radiogroup" aria-label="پشتیبان جدید">{data.items.map(agent => <label key={agent.id} className={`handoff-agent${selected?.id === agent.id ? " selected" : ""}`}>
        <input type="radio" name="handoffAgent" value={agent.id} checked={selected?.id === agent.id} disabled={disabled} onChange={() => onSelect(agent)} />
        <UserAvatar url={agent.avatarUrl} name={agent.displayName} /><span className="handoff-agent-copy"><span>{agent.displayName}</span><bdi dir="ltr">{agent.mobile}</bdi></span>
      </label>)}</div>
      {!data.items.length && <p className="handoff-empty">{search ? "پشتیبانی با این نام پیدا نشد." : "پشتیبان فعال دیگری برای ارجاع وجود ندارد؛ می‌توانید درخواست را به صف عمومی برگردانید."}</p>}
      {data.pagination.totalPages > 1 && <nav className="handoff-pagination" aria-label="صفحه‌بندی پشتیبان‌ها">
        <button type="button" disabled={disabled || page <= 1} onClick={() => setPage(value => value - 1)}>قبلی</button>
        <span>صفحه {page.toLocaleString("fa-IR")} از {data.pagination.totalPages.toLocaleString("fa-IR")}</span>
        <button type="button" disabled={disabled || page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>بعدی</button>
      </nav>}
    </>}
  </div>;
}
