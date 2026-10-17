"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserRole, authErrorMessage, homeForRole } from "@/lib/auth";
import { ClientNavigation, SupportNavigation } from "./DashboardNavigation";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { AgentReplyReminders } from "@/components/tickets/AgentReplyReminders";
import { TicketinoMark } from "@/components/brand/TicketinoMark";

export function DashboardShell({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const profilePath = role === "agent" ? "/support/profile" : "/client/profile";
  const isChat = /^\/(client|support)\/tickets\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setLogoutError(authErrorMessage(error));
    } finally {
      setIsLoggingOut(false);
    }
  }

  const logoutButton = (
    <button className="logout-button" onClick={handleLogout} disabled={isLoggingOut} type="button" aria-busy={isLoggingOut}>
      {isLoggingOut ? "در حال خروج..." : "خروج از حساب"}
    </button>
  );

  return (
    <div className={`dashboard-layout${isChat ? " chat-layout" : ""}`} dir="rtl">
      {role === "agent" && user && <AgentReplyReminders key={user.id} userId={user.id} />}
      <aside className="dashboard-sidebar">
        <Link href={homeForRole(role)} className="brand-mark">
          <span className="brand-symbol"><TicketinoMark /></span><span>تیکتینو</span>
        </Link>
        <div className="sidebar-label">فضای کاری</div>
        {role === "agent" ? <SupportNavigation /> : <ClientNavigation />}
        <div className="sidebar-bottom">
          <div className="user-chip">
            <UserAvatar url={user?.avatarUrl} name={user?.fullName ?? user?.mobile ?? "ت"} />
            <span className="user-details"><strong>{user?.fullName ?? user?.name ?? "کاربر"}</strong><small>{role === "agent" ? "کارشناس پشتیبانی" : "حساب مشتری"}</small></span>
            <Link href={profilePath} className="user-profile-edit" aria-label="ویرایش نام و عکس پروفایل" title="ویرایش پروفایل">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m16 3 5 5M4 15 16 3a3.54 3.54 0 0 1 5 5L9 20l-6 1 1-6Z" />
              </svg>
            </Link>
          </div>
          {logoutButton}
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="topbar">
          <div><span className="topbar-caption">{role === "agent" ? "مرکز پشتیبانی" : "پرتال مشتری"}</span><span className="topbar-dot" /></div>
          <div><Link href={profilePath} className="topbar-user" aria-label="ویرایش پروفایل">{user?.fullName ?? user?.name ?? user?.mobile}</Link><div className="mobile-logout">{logoutButton}</div></div>
        </header>
        {logoutError && <div className="notice error-notice logout-notice" role="alert">{logoutError}</div>}
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
