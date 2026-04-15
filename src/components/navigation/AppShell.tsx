"use client";

import { isPublicProfileMode } from "@/lib/deployment";
import { AppFooter } from "./AppFooter";
import { Sidebar } from "./Sidebar";
import { BottomTabBar } from "./BottomTabBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const publicProfileMode = isPublicProfileMode();

  return (
    <>
      {/* Desktop sidebar */}
      {!publicProfileMode && <Sidebar />}

      {/* Main content area */}
      <div className={publicProfileMode ? "flex flex-col min-h-screen" : "md:pl-60 flex flex-col min-h-screen"}>
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
        <AppFooter />
      </div>

      {/* Mobile bottom tab bar */}
      {!publicProfileMode && <BottomTabBar />}
    </>
  );
}
