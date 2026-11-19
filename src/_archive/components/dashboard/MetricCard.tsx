import type { ReactNode } from "react";

export default function MetricCard({
  icon,
  label,
  value,
  context,
  trend,
  progress,
  secondary,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  context: string;
  trend?: ReactNode;
  progress?: number;
  secondary?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200"
      : tone === "warning"
        ? "border-amber-200"
        : tone === "success"
          ? "border-green-200"
          : "border-slate-200";

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        {trend}
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{context}</p>

      {typeof progress === "number" && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}

      {secondary && <p className="mt-3 text-xs font-medium text-slate-500">{secondary}</p>}
    </article>
  );
}
