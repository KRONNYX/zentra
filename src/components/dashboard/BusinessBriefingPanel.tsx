import BusinessHealthScore, {
  type HealthScore,
} from "@/components/dashboard/BusinessHealthScore";

export default function BusinessBriefingPanel({
  greeting,
  barName,
  message,
  health,
}: {
  greeting: string;
  barName: string;
  message: string;
  health: HealthScore;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] bg-slate-950 text-white shadow-xl">
      <div className="grid gap-5 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.35),transparent_36%),linear-gradient(135deg,#020617,#0f172a_58%,#172554)] p-5 sm:p-6 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-blue-200">{greeting}</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              {barName} Mission Control
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
              {message}
            </p>
          </div>
        </div>

        <BusinessHealthScore health={health} />
      </div>
    </section>
  );
}
