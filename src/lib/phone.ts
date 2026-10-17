export type Country = { id: number; name: string; isoCode: string; phoneCode: string; flag?: string };
export const iran: Country = { id: 105, name: "ایران", isoCode: "IR", phoneCode: "+98", flag: "/flags/ir.svg" };
export function englishDigits(value: string) {
  return value.replace(/[۰-۹]/g, value => String("۰۱۲۳۴۵۶۷۸۹".indexOf(value))).replace(/[٠-٩]/g, value => String("٠١٢٣٤٥٦٧٨٩".indexOf(value)));
}
export function nationalMobile(value: string, phoneCode: string) {
  let digits = englishDigits(value).replace(/\D/g, "");
  const prefix = phoneCode.replace(/\D/g, "");
  if (value.trim().startsWith("+") || digits.startsWith("00")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith(prefix)) digits = digits.slice(prefix.length);
  }
  return digits.replace(/^0+/, "").slice(0, 15);
}
export function mobileError(mobile: string, countryId = 105) {
  const value = englishDigits(mobile).trim();
  if (!value) return "شماره موبایل را وارد کنید.";
  const digits = value.replace(/\D/g, "");
  if (!/^[+\d\s()-]+$/.test(value) || digits.length < 8 || digits.length > 15) return "شماره موبایل معتبر نیست.";
  if (countryId === 105 && !/^(?:\+98|0098|98|0)?9\d{9}$/.test(digits.startsWith("98") ? "+" + digits : value.replace(/[\s()-]/g, "")))
    return "شماره موبایل ایران باید ۱۰ رقم باشد (بدون صفر اول).";
  return "";
}
