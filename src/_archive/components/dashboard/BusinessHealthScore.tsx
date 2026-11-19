import type { Alert, DailyMetrics } from "@/services/dashboardService";

export type HealthScore = {
  score: number;
  label: "Excellent" | "Healthy" | "Needs Attention" | "At Risk";
  breakdown: string[];
};

export function calculateBusinessHealth(
  metrics: DailyMetrics,
  alerts: Alert[],
): HealthScore {
  let score = 100;
  const breakdown: string[] = [];

  // Simple UI scoring until the backend has a richer intelligence model.
  if (metrics.revenueTotal <= 0) {
    score -= 35;
    breakdown.push("No revenue recorded for this period.");
  } else {
    breakdown.push("Revenue has been recorded.");
  }

  if (metrics.billsTotal > 0) {
    score -= 15;
    breakdown.push(`${metrics.billsCount} unpaid bill${metrics.billsCount === 1 ? "" : "s"} need review.`);
  }

  if (
    metrics.revenueTotal > 0 &&
    metrics.expensesTotal / metrics.revenueTotal > 0.35
  ) {
    score -= 15;
    breakdown.push("Expenses are high compared with revenue.");
  }

  const dangerCount = alerts.filter((alert) => alert.severity === "danger").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;

  if (dangerCount > 0) {
    score -= 20;
    breakdown.push(`${dangerCount} urgent alert${dangerCount === 1 ? "" : "s"} detected.`);
  }

  if (warningCount > 0) {
    score -= 10;
    breakdown.push(`${warningCount} warning${warningCount === 1 ? "" : "s"} detected.`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const label =
    finalScore >= 90
      ? "Excellent"
      : finalScore >= 75
        ? "Healthy"
        : finalScore >= 55
          ? "Needs Attention"
          : "At Risk";

  return {
    score: finalScore,
    label,
    breakdown: breakdown.slice(0, 4),
  };
}

export default function BusinessHealthScore({ health }: { health: HealthScore }) {
  const labelClass =
    health.label === "Excellent"
      ? "bg-green-100 text-green-800"
      : health.label === "Healthy"
        ? "bg-blue-100 text-blue-800"
        : health.label === "Needs Attention"
          ? "bg-amber-100 text-amber-900"
          : "bg-red-100 text-red-800";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Business Health
          </p>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-4xl font-black tracking-tight">{health.score}</p>
            <p className="pb-1 text-sm text-slate-300">/100</p>
          </div>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-bold ${labelClass}`}>
          {health.label}
        </span>
      </div>

      <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-300">
        {health.breakdown.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
