import { CircleDot } from "lucide-react";

export type ActivityItem = {
  label: string;
  detail: string;
};

export default function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-bold text-slate-950">Recent Activity</h2>
        <p className="text-sm text-slate-500">Generated from current dashboard data</p>
      </div>

      <div className="space-y-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label} className="flex gap-3">
              <CircleDot size={18} className="mt-0.5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-bold text-slate-900">{item.label}</p>
                <p className="text-sm text-slate-500">{item.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Activity will appear as daily closures are recorded.
          </p>
        )}
      </div>
    </section>
  );
}
