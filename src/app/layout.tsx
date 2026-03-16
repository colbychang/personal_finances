import type { Metadata } from "next";
import { AppShell } from "@/components/navigation";
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
