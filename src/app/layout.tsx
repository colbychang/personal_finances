import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import {
  ServiceWorkerRegistration,
  OfflineIndicator,
} from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Finance Tracker",
  description: "Track your spending, budgets, and net worth",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finances",
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <ToastProvider>
          <OfflineIndicator />
          <AppShell>{children}</AppShell>
        </ToastProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
