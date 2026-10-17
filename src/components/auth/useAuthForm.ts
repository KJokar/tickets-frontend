"use client";

import { useRef, useState, type FormEvent } from "react";
import { AuthApiError, authErrorMessage, type AuthFieldErrors, type AuthFieldName } from "@/lib/auth";

export function useAuthForm(validate: () => AuthFieldErrors, submit: () => Promise<void>) {
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const processing = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processing.current) return;
    setError("");
    const errors = validate();
    setFieldErrors(errors);
    const firstField = Object.keys(errors)[0];
    if (firstField) {
      setError("اطلاعات فرم معتبر نیست؛ فیلدهای مشخص‌شده را اصلاح کنید.");
      const input = Array.from(event.currentTarget.elements).find((element) => {
        const name = element.getAttribute("name") as AuthFieldName | null;
        return name !== null && errors[name];
      });
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    processing.current = true;
    setIsSubmitting(true);
    try {
      await submit();
    } catch (requestError) {
      setError(authErrorMessage(requestError));
      if (requestError instanceof AuthApiError) setFieldErrors(requestError.fieldErrors);
    } finally {
      processing.current = false;
      setIsSubmitting(false);
    }
  }

  return { fieldErrors, error, isSubmitting, handleSubmit };
}
