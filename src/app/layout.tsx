import type { Metadata } from "next";
import { AppShell } from "@/components/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Finance Tracker",
  description: "Track your spending, budgets, and net worth",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
