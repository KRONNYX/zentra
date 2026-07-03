"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useBarContext } from "@/hooks/useBarContext";
import { setSelectedBarId } from "@/lib/activeBar";
import { isSuperUser } from "@/lib/permissions";
import { listAllBarsForSuperUser } from "@/services/dashboardService";

type SwitcherBar = {
  id: string;
  name: string;
};

export default function BarSwitcher() {
  const { barContext, loading } = useBarContext();
  const [bars, setBars] = useState<SwitcherBar[]>([]);

  useEffect(() => {
    if (!isSuperUser(barContext?.role)) {
      return;
    }

    const loadBars = async () => {
      const { bars: nextBars } = await listAllBarsForSuperUser();
      setBars(nextBars);
    };

    loadBars();
  }, [barContext?.role]);

  if (loading || !barContext || !isSuperUser(barContext.role) || bars.length <= 1) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
      <label className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Building2 size={18} />
        </span>
        <span className="hidden font-semibold text-slate-600 sm:inline">
          Active bar
        </span>
        <select
          value={barContext.barId}
          onChange={(event) => {
            setSelectedBarId(event.target.value);
            window.location.reload();
          }}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:max-w-xs"
        >
          {bars.map((bar) => (
            <option key={bar.id} value={bar.id}>
              {bar.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
