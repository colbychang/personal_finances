"use client";

import { Sidebar } from "./Sidebar";
import { BottomTabBar } from "./BottomTabBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="md:pl-60 flex flex-col min-h-screen">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />
    </>
  );
}
