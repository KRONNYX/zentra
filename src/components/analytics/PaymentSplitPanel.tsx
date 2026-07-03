import { Banknote, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import type { DailyMetrics } from "@/services/dashboardService";
import { formatKes } from "@/services/dashboardService";

export default function PaymentSplitPanel({ metrics }: { metrics: DailyMetrics }) {
  const mpesaShare =
    metrics.revenueTotal > 0
      ? Math.round((metrics.mpesaTotal / metrics.revenueTotal) * 100)
      : 0;
  const cashShare =
    metrics.revenueTotal > 0
      ? Math.round((metrics.cashTotal / metrics.revenueTotal) * 100)
      : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-950">Payment Split</h2>
        <p className="mt-1 text-sm text-slate-500">
          Compare digital collections against cash exposure.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <PaymentRow
          icon={<Smartphone size={18} />}
          label="M-Pesa"
          value={formatKes(metrics.mpesaTotal)}
          share={mpesaShare}
          color="bg-blue-600"
        />
        <PaymentRow
          icon={<Banknote size={18} />}
          label="Cash"
          value={formatKes(metrics.cashTotal)}
          share={cashShare}
          color="bg-green-600"
        />
      </div>
    </section>
  );
}

function PaymentRow({
  icon,
  label,
  value,
  share,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  share: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="text-slate-500">{icon}</span>
          {label}
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-slate-950">{value}</p>
          <p className="text-xs text-slate-500">{share}%</p>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
