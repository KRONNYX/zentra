import type { DatePeriod } from "@/services/dashboardService";

export default function PeriodToggle({
  period,
  onChange,
}: {
  period: DatePeriod;
  onChange: (period: DatePeriod) => void;
}) {
  return (
    <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {(["day", "week", "month"] as DatePeriod[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-10 rounded-lg px-3 text-sm font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            period === option
              ? "bg-slate-950 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
