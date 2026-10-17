import { mobileError } from "./phone";
import type { AuthFieldErrors } from "./auth";

export const passwordMinLength = 12;
export const passwordMaxLength = 128;
export const passwordHint = "پیشنهاد امنیتی: ۱۲ نویسه با حرف بزرگ و کوچک، عدد و نماد";

export function passwordRequirements(password: string): boolean[] {
  return [
    password.length >= passwordMinLength && password.length <= passwordMaxLength,
    /\p{Lu}/u.test(password),
    /\p{Ll}/u.test(password),
    /\p{Nd}/u.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ];
}

export function validateLogin(mobile: string, password: string, countryId = 105): AuthFieldErrors {
  return {
    ...(mobileError(mobile, countryId) ? { mobile: mobileError(mobile, countryId) } : {}),
    ...(!Number.isSafeInteger(countryId) || countryId < 1 ? { countryId: "کشور را انتخاب کنید." } : {}),
    ...(!password ? { password: "رمز عبور را وارد کنید." } : password.length > passwordMaxLength ? { password: "رمز عبور باید حداکثر ۱۲۸ نویسه داشته باشد." } : {}),
  };
}

export function validateSignup(values: {
  fullName: string;
  mobile: string;
  countryId?: number;
  password: string;
  confirmPassword: string;
  role: string;
}): AuthFieldErrors {
  const errors = validateLogin(values.mobile, values.password, values.countryId);
  if (!values.fullName.trim()) errors.fullName = "نام و نام خانوادگی را وارد کنید.";
  else if (values.fullName.trim().length < 2 || values.fullName.trim().length > 150) errors.fullName = "نام و نام خانوادگی باید بین ۲ تا ۱۵۰ نویسه باشد.";
  if (!values.confirmPassword) errors.confirmPassword = "تکرار رمز عبور را وارد کنید.";
  else if (values.password !== values.confirmPassword) errors.confirmPassword = "رمز عبور و تکرار آن یکسان نیستند.";
  if (values.role !== "client" && values.role !== "agent") errors.role = "نوع حساب را انتخاب کنید.";
  return errors;
}
