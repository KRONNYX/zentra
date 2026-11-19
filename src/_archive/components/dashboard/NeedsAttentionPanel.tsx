import { AlertTriangle, CheckCircle2, Info, Siren } from "lucide-react";
import type { Alert } from "@/services/dashboardService";

export default function NeedsAttentionPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-bold text-slate-950">Needs Attention</h2>
        <p className="text-sm text-slate-500">Risks and intelligence notes</p>
      </div>

      <div className="space-y-3">
        {alerts.length > 0 ? (
          alerts.map((alert) => <AttentionItem key={alert.id} alert={alert} />)
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
            <div className="flex gap-3">
              <CheckCircle2 size={20} className="shrink-0" />
              <div>
                <p className="text-sm font-bold">Nothing urgent right now</p>
                <p className="mt-1 text-sm text-green-800">
                  Close the day to keep intelligence fresh.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AttentionItem({ alert }: { alert: Alert }) {
  const Icon =
    alert.severity === "danger"
      ? Siren
      : alert.severity === "warning"
        ? AlertTriangle
        : Info;
  const className =
    alert.severity === "danger"
      ? "border-red-200 bg-red-50 text-red-900"
      : alert.severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <div className="flex gap-3">
        <Icon size={20} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide">
            {alert.severity}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6">{alert.message}</p>
        </div>
        <span className="hidden text-xs font-bold sm:inline">Review</span>
      </div>
    </div>
  );
}
