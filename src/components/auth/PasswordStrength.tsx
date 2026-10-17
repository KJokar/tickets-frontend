import { passwordRequirements } from "@/lib/auth-validation";

export function PasswordStrength({ password, id }: { password: string; id: string }) {
  const requirements = passwordRequirements(password);
  const score = requirements.every(Boolean) ? 3
    : password.length >= 8 && requirements.filter(Boolean).length >= 3 ? 2 : 1;
  const level = ["weak", "medium", "strong"][score - 1];
  const label = ["ضعیف", "متوسط", "قوی"][score - 1];

  return (
    <div id={id} className={`pair-password-strength ${level}`} role="status" aria-live="polite" aria-atomic="true">
      <span>قدرت رمز: {label}</span>
      <span className="pair-strength-bars" aria-hidden="true">
        {[1, 2, 3].map((step) => <i key={step} className={step <= score ? "filled" : undefined} />)}
      </span>
    </div>
  );
}
