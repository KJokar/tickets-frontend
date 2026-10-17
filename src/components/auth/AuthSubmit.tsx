export function AuthSubmit({ pending, label, pendingLabel, disabled = false }: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  return (
    <button className="pair-primary-button" type="submit" disabled={pending || disabled}>
      {pending ? <><span className="pair-spinner" aria-hidden="true" />{pendingLabel}</> : <>
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 12H5m6 6-6-6 6-6" /></svg>
      </>}
    </button>
  );
}
