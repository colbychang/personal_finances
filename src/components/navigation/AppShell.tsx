"use client";

import { isPublicProfileMode } from "@/lib/deployment";
import { PlaidAutoSync } from "@/components/plaid/PlaidAutoSync";
import { usePathname } from "next/navigation";
import { AppFooter } from "./AppFooter";
import { Sidebar } from "./Sidebar";
import { BottomTabBar } from "./BottomTabBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const publicProfileMode = isPublicProfileMode();
  const pathname = usePathname();
  const enablePlaidAutoSync = process.env.NEXT_PUBLIC_ENABLE_PLAID_AUTO_SYNC === "1";
  const chromeHidden =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/access-pending");
  const showAppChrome = !publicProfileMode && !chromeHidden;

  return (
    <>
      {/* Desktop sidebar */}
      {showAppChrome && <Sidebar />}
      {showAppChrome && enablePlaidAutoSync && <PlaidAutoSync />}

      {/* Main content area */}
      <div className={showAppChrome ? "md:pl-60 flex flex-col min-h-screen" : "flex flex-col min-h-screen"}>
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
        <AppFooter />
      </div>

      {/* Mobile bottom tab bar */}
      {showAppChrome && <BottomTabBar />}
    </>
  );
}
