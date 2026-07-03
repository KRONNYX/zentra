"use client";

import type { ReactNode } from "react";
import BarSwitcher from "@/components/layout/BarSwitcher";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import SidebarNav from "@/components/layout/SidebarNav";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[280px_1fr]">
      <SidebarNav />
      <main className="min-w-0 pb-24 lg:pb-0">
        <BarSwitcher />
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
