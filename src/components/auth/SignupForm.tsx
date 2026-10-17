"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput, useCountries } from "./PhoneInput";
import { AuthField } from "@/components/auth/AuthField";
import { AuthLayout, AuthTabs, TicketinoLogo } from "@/components/auth/AuthChrome";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage, getRoles, homeForRole, type RoleOption, type UserRole } from "@/lib/auth";
import { validateSignup } from "@/lib/auth-validation";
import { AuthSubmit } from "./AuthSubmit";
import { useAuthForm } from "./useAuthForm";

export function SignupForm() {
  const router = useRouter();
  const { user, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [countryId, setCountryId] = useState(105);
  const { countries, error: countryError, retry: retryCountries } = useCountries();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleError, setRoleError] = useState("");
  const [roleAttempt, setRoleAttempt] = useState(0);
  useEffect(() => {
    if (user) router.replace(homeForRole(user.role));
  }, [user, router]);
  useEffect(() => {
    const controller = new AbortController();
    getRoles(controller.signal).then((options) => {
      if (!controller.signal.aborted) { setRoles(options); setRoleError(""); }
    }).catch((error) => { if (!controller.signal.aborted) setRoleError(authErrorMessage(error)); });
    return () => controller.abort();
  }, [roleAttempt]);
  const { error, fieldErrors, isSubmitting, handleSubmit } = useAuthForm(
    () => ({ ...validateSignup({ fullName, mobile, countryId, password, confirmPassword, role }), ...(!countries.some(country => country.id === countryId) ? { countryId: "ابتدا کشور را از فهرست انتخاب کنید." } : {}) }),
    async () => {
      if (!role || !roles.some((option) => option.value === role)) return;
      const currentUser = await register({ fullName: fullName.trim(), mobile: mobile.trim(), countryId, password, confirmPassword, role });
      setPassword("");
      setConfirmPassword("");
      router.replace(homeForRole(currentUser.role));
    },
  );

  return (
    <AuthLayout variant="signup">
      <div className="pair-card-brand"><TicketinoLogo compact /><span className="pair-step-badge">ثبت‌نام</span></div>
      <div className="pair-card-heading">
        <h1 id="signup-title">ساخت حساب کاربری</h1>
        <p>برای ثبت و پیگیری درخواست‌ها، حساب بسازید.</p>
      </div>
      <AuthTabs mode="signup" />
      {error && <div className="pair-error-banner" role="alert">{error}</div>}
      <form className="pair-auth-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting} aria-labelledby="signup-title">
        <AuthField id="fullName" label="نام و نام خانوادگی" value={fullName} autoComplete="name" onChange={setFullName} error={fieldErrors.fullName} disabled={isSubmitting} />
        <PhoneInput countries={countries} countryId={countryId} onCountryChange={setCountryId} mobile={mobile} onMobileChange={setMobile} error={fieldErrors.mobile || fieldErrors.countryId} countryError={countryError} onRetry={retryCountries} disabled={isSubmitting} />
        <div className="pair-field pair-role-field">
          <label htmlFor="role">نوع حساب</label>
          <div className={`pair-input-wrap${fieldErrors.role ? " has-error" : ""}`}>
            <select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={isSubmitting || !roles.length} required aria-invalid={Boolean(fieldErrors.role)} aria-describedby={fieldErrors.role || roleError ? "role-error" : undefined}>
              <option value="" disabled>{roleError ? "دریافت نوع حساب ناموفق بود" : !roles.length ? "در حال دریافت نوع حساب..." : "نوع حساب را انتخاب کنید"}</option>
              {roles.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {fieldErrors.role && <p className="pair-field-error" id="role-error">{fieldErrors.role}</p>}
          {roleError && <p className="pair-field-error" role="alert" id={fieldErrors.role ? undefined : "role-error"}>{roleError} <button className="text-link inline-retry" type="button" onClick={() => setRoleAttempt((value) => value + 1)}>تلاش دوباره</button></p>}
        </div>
        <AuthField id="password" label="رمز عبور" type="password" value={password} autoComplete="new-password" onChange={setPassword} error={fieldErrors.password} disabled={isSubmitting} />
        <AuthField id="confirmPassword" label="تکرار رمز عبور" type="password" value={confirmPassword} autoComplete="new-password" onChange={setConfirmPassword} error={fieldErrors.confirmPassword} disabled={isSubmitting} />
        <AuthSubmit pending={isSubmitting} disabled={!roles.length || !countries.some(country => country.id === countryId)} label="ساخت حساب کاربری" pendingLabel="در حال ساخت حساب..." />
      </form>
      <div className="pair-secure-note"><span aria-hidden="true">◇</span>حساب شما با نوع دسترسی انتخاب‌شده ساخته می‌شود.</div>
    </AuthLayout>
  );
}
