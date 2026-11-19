import { BarChart3 } from "lucide-react";
import type { DailyMetrics, DatePeriod } from "@/services/dashboardService";
import { formatKes, periodTitle } from "@/services/dashboardService";

export default function RevenueSnapshot({
  metrics,
  period,
}: {
  metrics: DailyMetrics;
  period: DatePeriod;
}) {
  const values = [
    { label: "M-Pesa", value: metrics.mpesaTotal, color: "bg-blue-600" },
    { label: "Cash", value: metrics.cashTotal, color: "bg-green-600" },
    { label: "Bills", value: metrics.billsTotal, color: "bg-amber-500" },
    { label: "Expenses", value: metrics.expensesTotal, color: "bg-red-500" },
  ];
  const maxValue = Math.max(...values.map((item) => item.value), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-950">Revenue Snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">
            {periodTitle(period)} performance from closed business days.
          </p>
        </div>
        <BarChart3 size={20} className="text-slate-400" />
      </div>

      <div className="flex h-56 items-end gap-3 rounded-2xl bg-slate-50 px-4 py-5">
        {values.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-3">
            <div className="flex h-36 w-full items-end">
              <div
                className={`w-full rounded-t-xl ${item.color}`}
                style={{ height: `${Math.max(8, (item.value / maxValue) * 100)}%` }}
              />
            </div>
            <div className="min-w-0 text-center">
              <p className="truncate text-xs font-bold text-slate-700">{item.label}</p>
              <p className="text-[11px] font-medium text-slate-500">
                {formatKes(item.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
