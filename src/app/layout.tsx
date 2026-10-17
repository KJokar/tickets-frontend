import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { TicketRealtimeProvider } from "@/components/tickets/TicketRealtime";
import "./globals.css";

const vazirmatn = localFont({
  src: "../assets/fonts/Vazirmatn.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: "تیکتینو | سامانه پشتیبانی",
  description: "ثبت و پیگیری درخواست‌های پشتیبانی در تیکتینو",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl">
      <body className={vazirmatn.variable}>
        <AuthProvider><TicketRealtimeProvider>{children}</TicketRealtimeProvider></AuthProvider>
      </body>
    </html>
  );
}
