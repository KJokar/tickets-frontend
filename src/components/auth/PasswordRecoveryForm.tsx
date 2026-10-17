"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthLayout, TicketinoLogo } from "./AuthChrome";
import { AuthField } from "./AuthField";
import { AuthSubmit } from "./AuthSubmit";
import { PhoneInput, useCountries } from "./PhoneInput";
import { iran } from "@/lib/phone";
type Step = "phone" | "code" | "password" | "success";
type Operation = "request" | "resend" | "verify" | "reset";
type ApiEnvelope<T> = { message?: string; data?: T };

function englishDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function remainingTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function serverLifetime(value: unknown) {
  // ASP.NET's WriteAsString setting also applies to expiry values.
  const lifetime = typeof value === "string" ? Number(value) : value;
  return typeof lifetime === "number" && Number.isFinite(lifetime) && lifetime > 0 ? lifetime : null;
}

export function PasswordRecoveryForm() {
  const { countries, error: countryError, retry: retryCountries } = useCountries();
  const [countryId, setCountryId] = useState(String(iran.id));
  const [step, setStep] = useState<Step>("phone");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const focusTargetRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectedCountry = countries.find((country) => String(country.id) === countryId) ?? iran;
  const expiresIn = Math.max(0, Math.ceil((expiresAt - clock) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  useEffect(() => {
    if (step !== "code" && step !== "password") return;
    const tick = () => setClock(Date.now());
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [step]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (!focusTargetRef.current) return;
    const target = rootRef.current?.querySelector<HTMLElement>(`#${focusTargetRef.current}`);
    if (target && !target.matches(":disabled")) {
      target.focus();
      focusTargetRef.current = null;
    }
  });

  function clearError(id: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setError("");
  }

  function showError(message: string) {
    setError(message);
    focusTargetRef.current = "recovery-error";
  }

  function validatePhone() {
    if (!countries.some(country => String(country.id) === countryId)) return "ابتدا کشور را از فهرست انتخاب کنید.";
    if (selectedCountry.isoCode.toUpperCase() === "IR" && mobile.length !== 10) return "شماره موبایل ایران باید ۱۰ رقم باشد (بدون صفر اول).";
    if (mobile.length < 8 || mobile.length > 15) return "شماره موبایل معتبر وارد کنید.";
    return "";
  }

  async function sendCode(operation: "request" | "resend") {
    if (pendingRef.current || (operation === "resend" && Date.now() < resendAt)) return;
    const validationError = validatePhone();
    if (validationError) {
      setFieldErrors({ mobile: validationError });
      focusTargetRef.current = "mobile";
      return;
    }

    pendingRef.current = true;
    setPending(operation);
    setError("");
    setNotice("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/v1/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: Number(countryId), mobile }),
        signal: controller.signal,
      });
      const result = await response.json() as ApiEnvelope<{ expiresInSeconds: number | string }>;
      if (!response.ok) {
        showError(result.message || (response.status === 429 ? "درخواست‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید." : "ارسال کد انجام نشد. دوباره تلاش کنید."));
        return;
      }
      const lifetime = serverLifetime(result.data?.expiresInSeconds);
      if (lifetime === null) {
        showError("اطلاعات اعتبار کد از سرور دریافت نشد. دوباره تلاش کنید.");
        return;
      }
      const now = Date.now();
      setClock(now);
      setExpiresAt(now + lifetime * 1000);
      setResendAt(now + Math.min(60, lifetime) * 1000);
      setCode("");
      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      setFieldErrors({});
      setStep("code");
      setNotice(operation === "resend" ? "کد جدید ارسال شد. از آخرین کد پیامک‌شده استفاده کنید." : "");
      focusTargetRef.current = "recovery-code";
    } catch (requestError) {
      if (!controller.signal.aborted) {
        showError(requestError instanceof SyntaxError ? "پاسخ سرور معتبر نبود. دوباره تلاش کنید." : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  async function verifyCode() {
    if (pendingRef.current) return;
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ "recovery-code": "کد تأیید ۶ رقمی پیامک‌شده را وارد کنید." });
      focusTargetRef.current = "recovery-code";
      return;
    }
    if (Date.now() >= expiresAt) {
      setClock(Date.now());
      showError("اعتبار کد تمام شده است. کد جدید درخواست کنید.");
      return;
    }

    pendingRef.current = true;
    setPending("verify");
    setError("");
    setNotice("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/v1/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: Number(countryId), mobile, code }),
        signal: controller.signal,
      });
      const result = await response.json() as ApiEnvelope<{ resetToken: string; expiresInSeconds: number | string }>;
      if (!response.ok) {
        showError(result.message || "کد تأیید صحیح نیست یا منقضی شده است.");
        return;
      }
      const lifetime = serverLifetime(result.data?.expiresInSeconds);
      const token = result.data?.resetToken;
      if (lifetime === null || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        showError("مجوز تغییر رمز از سرور دریافت نشد. دوباره کد تأیید دریافت کنید.");
        return;
      }
      const now = Date.now();
      setClock(now);
      setExpiresAt(now + lifetime * 1000);
      setResetToken(token);
      setCode("");
      setFieldErrors({});
      setStep("password");
      focusTargetRef.current = "new-password";
    } catch (requestError) {
      if (!controller.signal.aborted) {
        showError(requestError instanceof SyntaxError ? "پاسخ سرور معتبر نبود. دوباره تلاش کنید." : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  async function resetPassword() {
    if (pendingRef.current) return;
    const errors: Record<string, string> = {};
    if (password.length < 1 || password.length > 128) errors["new-password"] = "رمز عبور باید بین ۱ تا ۱۲۸ کاراکتر باشد.";
    if (!confirmPassword) errors["confirm-new-password"] = "تکرار رمز عبور را وارد کنید.";
    else if (password !== confirmPassword) errors["confirm-new-password"] = "رمز عبور و تکرار آن یکسان نیستند.";
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) {
      focusTargetRef.current = Object.keys(errors)[0];
      return;
    }
    if (!resetToken || Date.now() >= expiresAt) {
      setClock(Date.now());
      setResetToken("");
      showError("مهلت ثبت رمز جدید تمام شده است. دوباره کد تأیید دریافت کنید.");
      return;
    }

    pendingRef.current = true;
    setPending("reset");
    setNotice("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/v1/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: Number(countryId), mobile, resetToken: resetToken, password, confirmPassword: confirmPassword }),
        signal: controller.signal,
      });
      const result = await response.json() as ApiEnvelope<{ passwordChanged: boolean }>;
      if (!response.ok || result.data?.passwordChanged !== true) {
        showError(result.message || "تغییر رمز عبور انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.");
        return;
      }
      setCode("");
      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      setMobile("");
      setStep("success");
      focusTargetRef.current = "recovery-success";
    } catch (requestError) {
      if (!controller.signal.aborted) {
        showError(requestError instanceof SyntaxError ? "پاسخ سرور معتبر نبود. دوباره تلاش کنید." : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "phone") void sendCode("request");
    else if (step === "code") void verifyCode();
    else if (step === "password") void resetPassword();
  }

  function editPhone() {
    if (pendingRef.current) return;
    setStep("phone");
    setCode("");
    setResetToken("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
    setFieldErrors({});
    focusTargetRef.current = "mobile";
  }

  return <div ref={rootRef}><AuthLayout>
    <div className="pair-card-brand"><TicketinoLogo compact /><span className="pair-step-badge">{step === "success" ? "رمز جدید آماده است" : `مرحله ${step === "phone" ? "۱" : step === "code" ? "۲" : "۳"} از ۳`}</span></div>
    {step === "success" ? <div className="recovery-success">
      <h1 id="recovery-success" tabIndex={-1}>رمز عبورتان تغییر کرد</h1><p>حالا با شماره موبایل و رمز جدید وارد شوید.</p><Link className="pair-primary-button" href="/login">ورود با رمز جدید</Link>
    </div> : <>
      <div className="pair-card-heading"><h1>{step === "phone" ? "رمزتان را فراموش کرده‌اید؟" : step === "code" ? "شماره‌تان را تأیید کنید" : "رمز جدید انتخاب کنید"}</h1>
        <p>{step === "phone" ? "شماره موبایل حسابتان را وارد کنید تا کد تأیید را بفرستیم." : step === "code" ? "کد ۶ رقمی پیامک‌شده را وارد کنید." : "شماره تأیید شد؛ رمز عبور جدیدتان را وارد کنید."}</p></div>
      <form id="auth-form" className="pair-auth-form recovery-form" onSubmit={handleSubmit} noValidate aria-label="بازیابی رمز عبور" aria-busy={pending !== null}>
        <fieldset disabled={pending !== null}>
          {step === "phone" ? <PhoneInput countries={countries} countryId={Number(countryId)} onCountryChange={value => { setCountryId(String(value)); clearError("mobile"); }} mobile={mobile} onMobileChange={value => { setMobile(value); clearError("mobile"); }} error={fieldErrors.mobile} countryError={countryError} onRetry={retryCountries} /> : <>
            <div className="recovery-phone-summary"><div><span>{step === "code" ? "کد به این شماره ارسال شد" : "شماره تأییدشده"}</span><bdi dir="ltr">{selectedCountry.phoneCode} {mobile}</bdi></div><button type="button" className="text-link inline-retry" onClick={editPhone}>ویرایش شماره</button></div>
            {step === "code" ? <AuthField id="recovery-code" label="کد تأیید پیامکی" value={code} onChange={value => { setCode(englishDigits(value).replace(/\D/g, "").slice(0, 6)); clearError("recovery-code"); }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={fieldErrors["recovery-code"]} /> : <>
              <AuthField id="new-password" label="رمز عبور جدید" type="password" value={password} onChange={value => { setPassword(value); clearError("new-password"); }} autoComplete="new-password" maxLength={128} error={fieldErrors["new-password"]} />
              <AuthField id="confirm-new-password" label="تکرار رمز عبور جدید" type="password" value={confirmPassword} onChange={value => { setConfirmPassword(value); clearError("confirm-new-password"); }} autoComplete="new-password" maxLength={128} error={fieldErrors["confirm-new-password"]} />
            </>}
          </>}
          {error && <div id="recovery-error" tabIndex={-1} role="alert" className="pair-error-banner">{error}</div>}
          {(step === "code" || step === "password") && expiresIn === 0 && <p className="pair-field-error" role="status">مهلت تمام شده است. دوباره کد تأیید دریافت کنید.</p>}
          <AuthSubmit pending={pending !== null && pending !== "resend"} pendingLabel="در حال انجام…" disabled={pending !== null || (step === "phone" ? !countries.some(country => String(country.id) === countryId) : expiresIn === 0)} label={step === "phone" ? "دریافت کد تأیید" : step === "code" ? "تأیید کد و ادامه" : "ثبت رمز عبور جدید"} />
        </fieldset>
        {step === "code" && <div className="recovery-resend"><span role="timer">اعتبار کد: <bdi dir="ltr">{remainingTime(expiresIn)}</bdi></span><button type="button" className="text-link inline-retry" disabled={pending !== null || resendIn > 0} onClick={() => void sendCode("resend")}>{pending === "resend" ? "در حال ارسال…" : resendIn > 0 ? `ارسال مجدد تا ${resendIn.toLocaleString("fa-IR")} ثانیه` : "ارسال مجدد کد"}</button></div>}
        {step === "password" && <div className="recovery-resend"><span role="timer">مهلت ثبت رمز: <bdi dir="ltr">{remainingTime(expiresIn)}</bdi></span><button type="button" className="text-link inline-retry" onClick={editPhone} disabled={pending !== null}>دریافت دوباره کد</button></div>}
        {notice && <p className="notice success-notice" role="status">{notice}</p>}
      </form>
      <Link className="pair-forgot-password" href="/login">بازگشت به ورود</Link>
    </>}
  </AuthLayout></div>;
}

