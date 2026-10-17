"use client";

import { useState } from "react";
import { PasswordStrength } from "./PasswordStrength";

type AuthFieldProps = {
  id: string;
  label: string;
  type?: "text" | "tel" | "password";
  value: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  placeholder?: string;
  error?: string;
  hint?: string;
  showStrength?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function AuthField({
  id,
  label,
  type = "text",
  value,
  autoComplete, inputMode, maxLength, placeholder,
  error,
  hint,
  showStrength = false,
  disabled,
  onChange,
}: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="pair-field">
      <label htmlFor={id}>{label}</label>
      <div className={`pair-input-wrap${error ? " has-error" : ""}`}>
        <input
          id={id}
          name={id}
          type={isPassword && visible ? "text" : type}
          value={value}
          autoComplete={autoComplete}
          inputMode={inputMode} maxLength={maxLength} placeholder={placeholder}
          disabled={disabled}
          dir={type === "tel" || inputMode === "numeric" || isPassword ? "ltr" : "rtl"}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={[showStrength && value && `${id}-strength`, hint && !error && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
          required
        />
        {isPassword && (
          <button
            className="pair-password-toggle"
            type="button"
            disabled={disabled}
            aria-controls={id}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
          </button>
        )}
      </div>
      {showStrength && value && <PasswordStrength password={value} id={`${id}-strength`} />}
      {hint && !error && <p className="pair-field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="pair-field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}
