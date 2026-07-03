"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNavItems } from "@/components/layout/navItems";
import { useBarContext } from "@/hooks/useBarContext";

export default function SidebarNav() {
  const pathname = usePathname();
  const { barContext, loading } = useBarContext();
  const items = visibleNavItems(barContext?.role);

  return (
    <aside className="hidden border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:block">
      <div className="mb-8 px-2">
        <p className="text-xl font-bold tracking-tight">Zentra</p>
        <p className="mt-1 text-xs text-slate-400">Bar intelligence</p>
      </div>

      <nav className="space-y-1">
        {loading &&
          [0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-11 animate-pulse rounded-xl bg-slate-900"
            />
          ))}

        {!loading && items.length === 0 && (
          <p className="rounded-xl bg-slate-900 px-3 py-3 text-xs font-medium text-slate-400">
            Your permissions are not configured yet.
          </p>
        )}

        {!loading && items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
