"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { canCreateTicket } from "@/lib/auth";

type NavigationItem = { label: string; href: string; includesDetails?: boolean; createTicket?: boolean };

const clientItems: NavigationItem[] = [
  { label: "نمای کلی", href: "/client/dashboard" },
  { label: "درخواست‌های من", href: "/client/tickets", includesDetails: true },
  { label: "ثبت درخواست", href: "/client/tickets/new", createTicket: true },
];

const supportItems: NavigationItem[] = [
  { label: "نمای کلی", href: "/support/dashboard" },
  { label: "درخواست‌های من", href: "/support/tickets", includesDetails: true },
  { label: "بدون مسئول", href: "/support/tickets?scope=unassigned" },
  { label: "گزارش‌ها", href: "/support/reports" },
];

function DashboardNavigation({ items, label }: { items: NavigationItem[]; label: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedScope = searchParams.get("scope");
  const scope = requestedScope === "unassigned" ? requestedScope : null;

  function isActive(item: NavigationItem): boolean {
    const [hrefPath, hrefQuery] = item.href.split("?");
    const isDetail = item.includesDetails && pathname.startsWith(`${hrefPath}/`) && !pathname.endsWith("/new");
    if (pathname !== hrefPath && !isDetail) return false;
    if (isDetail) return true;
    return new URLSearchParams(hrefQuery).get("scope") === scope;
  }

  return (
    <nav className="side-navigation" aria-label={label}>
      {items.filter((item) => !item.createTicket || canCreateTicket(user)).map((item) => {
        const active = isActive(item);
        return (
          <Link className={active ? "side-link active" : "side-link"} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
            <span className="nav-mark" aria-hidden="true" />{item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ClientNavigation() {
  return <DashboardNavigation items={clientItems} label="ناوبری مشتری" />;
}

export function SupportNavigation() {
  return <DashboardNavigation items={supportItems} label="ناوبری پشتیبان" />;
}
