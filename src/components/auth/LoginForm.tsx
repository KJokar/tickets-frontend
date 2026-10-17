"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput, useCountries } from "./PhoneInput";
import { AuthField } from "@/components/auth/AuthField";
import { AuthLayout, AuthTabs, TicketinoLogo } from "@/components/auth/AuthChrome";
import { useAuth } from "@/components/auth/AuthProvider";
import { homeForRole } from "@/lib/auth";
import { validateLogin } from "@/lib/auth-validation";
import { AuthSubmit } from "./AuthSubmit";
import { useAuthForm } from "./useAuthForm";

export function LoginForm() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [mobile, setMobile] = useState("");
  const [countryId, setCountryId] = useState(105);
  const { countries, error: countryError, retry: retryCountries } = useCountries();
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const { error, fieldErrors, isSubmitting, handleSubmit } = useAuthForm(
    () => ({ ...validateLogin(mobile, password, countryId), ...(!countries.some(country => country.id === countryId) ? { countryId: "ابتدا کشور را از فهرست انتخاب کنید." } : {}) }),
    async () => {
      const currentUser = await login(mobile.trim(), password, rememberMe, countryId);
      setPassword("");
      router.replace(homeForRole(currentUser.role));
    },
  );

  useEffect(() => {
    if (user) router.replace(homeForRole(user.role));
  }, [user, router]);

  return (
    <AuthLayout>
      <div className="pair-card-brand"><TicketinoLogo compact /><span className="pair-step-badge">ورود امن</span></div>
      <div className="pair-card-heading">
        <h1 id="login-title">به تیکتینو خوش آمدید</h1>
        <p>برای ورود به فضای پشتیبانی، اطلاعات حساب خود را وارد کنید.</p>
      </div>
      <AuthTabs mode="login" />
        {error && <div className="pair-error-banner" role="alert">{error}</div>}

        <form className="pair-auth-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
          <PhoneInput countries={countries} countryId={countryId} onCountryChange={setCountryId} mobile={mobile} onMobileChange={setMobile} error={fieldErrors.mobile || fieldErrors.countryId} countryError={countryError} onRetry={retryCountries} disabled={isSubmitting} />
          <AuthField
            id="password"
            label="رمز عبور"
            type="password"
            value={password}
            autoComplete="current-password"
            error={fieldErrors.password}
            disabled={isSubmitting}
            onChange={setPassword}
          />
          <label className="pair-remember-me" title="ورود شما روی این دستگاه تا پایان اعتبار نشست حفظ می‌شود.">
            <input type="checkbox" name="rememberMe" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={isSubmitting} />
            <span>مرا به خاطر بسپار</span>
          </label>
          <Link href="/forgot-password" className="pair-forgot-password">رمز عبور را فراموش کرده‌اید؟</Link>
          <AuthSubmit pending={isSubmitting} disabled={!countries.some(country => country.id === countryId)} label="ورود به حساب" pendingLabel="در حال ورود..." />
        </form>

      <div className="pair-secure-note"><span aria-hidden="true">◇</span>برای پیگیری درخواست‌ها، وارد حساب خود شوید.</div>
    </AuthLayout>
  );
}
