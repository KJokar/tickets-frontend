import Link from "next/link";
import { TicketinoMark } from "@/components/brand/TicketinoMark";

export function TicketinoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/login" aria-label="تیکتینو" className="pair-logo">
      <span className={compact ? "pair-logo-mark compact" : "pair-logo-mark"}><TicketinoMark /></span>
      <span className="pair-logo-copy"><strong>تیکتینو</strong><small>مدیریت درخواست‌های پشتیبانی</small></span>
    </Link>
  );
}

export function AuthTabs({ mode }: { mode: "login" | "signup" }) {
  return (
    <nav className="pair-auth-tabs" aria-label="ورود یا ثبت‌نام">
      <Link href="/login" aria-current={mode === "login" ? "page" : undefined} className={mode === "login" ? "active" : ""}>ورود</Link>
      <Link href="/signup" aria-current={mode === "signup" ? "page" : undefined} className={mode === "signup" ? "active" : ""}>ساخت حساب</Link>
    </nav>
  );
}

function AuthShowcase() {
  const metrics = [
    { label: "درخواست‌های فعال", value: "۱۲۸", bars: [30, 65, 86, 56, 72, 94] },
    { label: "پاسخ‌های امروز", value: "۴۲", bars: [36, 58, 78, 66, 89, 78] },
    { label: "در انتظار رسیدگی", value: "۲۴", bars: [66, 40, 65, 51, 84, 67] },
  ];

  return (
    <aside className="pair-showcase" aria-labelledby="showcase-title">
      <div className="pair-showcase-brand"><TicketinoLogo /></div>
      <div className="pair-showcase-copy">
        <h2 id="showcase-title">همه‌چیز،<br />در یک <em>فضای پشتیبانی</em> منسجم</h2>
        <p>درخواست‌ها، گفت‌وگوها و پاسخ‌های تیم شما؛<br />ساده‌تر، سریع‌تر و یک‌جا.</p>
        <div className="pair-showcase-features">
          <span><b aria-hidden="true">◈</b>مدیریت درخواست‌ها</span>
          <span><b aria-hidden="true">▤</b>پیگیری گفت‌وگوها</span>
          <span><b aria-hidden="true">✦</b>پشتیبانی تیمی</span>
        </div>
      </div>
      <div className="pair-preview" aria-hidden="true">
        <div className="pair-preview-heading"><strong>نمای کلی پشتیبانی</strong><span>● همه‌چیز تحت کنترل</span></div>
        <div className="pair-metrics">
          {metrics.map(({ label, value, bars }) => (
            <div className="pair-metric" key={label}>
              <span>{label}</span><strong>{value}</strong>
              <div className="pair-mini-bars">{bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function AuthLayout({ children, variant }: { children: React.ReactNode; variant?: "signup" }) {
  return (
    <main className={`pair-auth-layout${variant === "signup" ? " pair-signup-layout" : ""}`} dir="rtl">
      <section className="pair-form-section">
        <div className="pair-auth-card">{children}</div>
      </section>
      <AuthShowcase />
    </main>
  );
}
