import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function ClientLayout({ children }: LayoutProps<"/client">) {
  return <AuthGuard role="client"><Suspense fallback={<div className="auth-loading">در حال بارگذاری...</div>}><DashboardShell role="client">{children}</DashboardShell></Suspense></AuthGuard>;
}