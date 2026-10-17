"use client";

import { useEffect, useState } from "react";
import { authErrorMessage, getCountries } from "@/lib/auth";
import { iran, nationalMobile, type Country } from "@/lib/phone";
import { CountrySelect } from "./CountrySelect";

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getCountries(controller.signal).then(countries => { if (!controller.signal.aborted) { setCountries(countries); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(authErrorMessage(error)); });
    return () => controller.abort();
  }, [attempt]);
  return { countries, error, retry: () => { setError(""); setAttempt(value => value + 1); } };
}
export function PhoneInput({ countries, countryId, onCountryChange, mobile, onMobileChange, error, countryError, onRetry, disabled }: {
  countries: Country[]; countryId: number; onCountryChange: (value: number) => void; mobile: string; onMobileChange: (value: string) => void;
  error?: string; countryError?: string; onRetry?: () => void; disabled?: boolean;
}) {
  const country = countries.find(country => country.id === countryId) ?? iran;
  return <div className="pair-phone-row">
    <div className="pair-field"><label htmlFor="countryId">کشور</label>
      <CountrySelect countries={countries} value={countryId} onChange={onCountryChange} disabled={disabled} error={countryError} />
    </div>
    <div className="pair-field"><label htmlFor="mobile">شماره موبایل</label><div className={`pair-input-wrap pair-mobile-wrap${error ? " has-error" : ""}`} dir="ltr">
      <span>{country.phoneCode}</span><input id="mobile" name="mobile" type="tel" dir="ltr" inputMode="tel" autoComplete="tel-national" value={mobile} placeholder={country.isoCode === "IR" ? "912 345 6789" : "555 123 4567"}
        onChange={event => onMobileChange(nationalMobile(event.target.value, country.phoneCode))} disabled={disabled} required aria-invalid={!!error} aria-describedby={error ? "mobile-error" : undefined} />
    </div>{error && <p id="mobile-error" className="pair-field-error">{error}</p>}</div>
    {countryError && <p id="country-error" className="pair-field-error pair-country-error" role="alert">{countryError} <button className="text-link inline-retry" type="button" onClick={onRetry} disabled={disabled}>تلاش دوباره</button></p>}
  </div>;
}
