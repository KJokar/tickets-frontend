"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRole, homeForRole } from "@/lib/auth";
import { useAuth } from "@/components/auth/AuthProvider";

export function AuthGuard({
  role,
  children,
}: {
  role: UserRole;
  children: React.ReactNode;
}) {
  const { user, status, error, refreshUser } = useAuth();
  const router = useRouter();
  const hasAccess = user?.role === role;

  useEffect(() => {
    if (status === "loading" || status === "error") return;
    if (!user) router.replace("/login");
    else if (!hasAccess) router.replace(homeForRole(user.role));
  }, [hasAccess, status, router, user]);

  if (status === "error") {
    return (
      <main className="auth-loading">
        <div className="session-error" role="alert">
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={() => void refreshUser()}>تلاش دوباره</button>
          <Link className="text-link" href="/login">رفتن به صفحه ورود</Link>
        </div>
      </main>
    );
  }

  if (status === "loading" || !hasAccess) {
    return <div className="auth-loading" role="status">در حال بررسی دسترسی...</div>;
  }

  return children;
}
