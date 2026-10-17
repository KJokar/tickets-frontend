import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function SupportLayout({ children }: LayoutProps<"/support">) {
  return <AuthGuard role="agent"><Suspense fallback={<div className="auth-loading">در حال بارگذاری...</div>}><DashboardShell role="agent">{children}</DashboardShell></Suspense></AuthGuard>;
}