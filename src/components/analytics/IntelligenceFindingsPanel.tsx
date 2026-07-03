import { Lightbulb } from "lucide-react";
import type { Alert, DailyMetrics } from "@/services/dashboardService";
import { formatKes } from "@/services/dashboardService";

export default function IntelligenceFindingsPanel({
  alerts,
  metrics,
}: {
  alerts: Alert[];
  metrics: DailyMetrics;
}) {
  const findings = buildFindings(alerts, metrics);

  return (
    <section className="rounded-2xl border border-slate-900 bg-slate-950 p-5 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
          <Lightbulb size={20} />
        </div>
        <div>
          <h2 className="font-bold">Intelligence Findings</h2>
          <p className="mt-1 text-sm text-slate-300">
            Plain-language notes for owner decisions.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3 text-sm text-slate-300">
        {findings.map((finding) => (
          <li key={finding} className="rounded-xl bg-white/5 p-3">
            {finding}
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildFindings(alerts: Alert[], metrics: DailyMetrics) {
  const findings = alerts.map((alert) => alert.message);

  if (metrics.billsTotal > 0) {
    findings.push(
      `${formatKes(metrics.billsTotal)} in unpaid bills is still open this month.`,
    );
  }

  if (metrics.revenueTotal > 0) {
    const expenseShare = Math.round((metrics.expensesTotal / metrics.revenueTotal) * 100);
    findings.push(`Expenses are ${expenseShare}% of revenue for this view.`);
  }

  if (findings.length === 0) {
    findings.push("Close more business days to detect trends and variances.");
    findings.push("Product ledger entries will power profit and stock movement insights.");
    findings.push("Payment mix changes will surface as owner alerts.");
  }

  return findings.slice(0, 5);
}
