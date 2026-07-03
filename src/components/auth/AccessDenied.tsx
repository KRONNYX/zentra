import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function AccessDenied({
  title = "Access restricted",
  message = "You do not have permission to view this area. Contact your administrator if you believe this is incorrect.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <ShieldAlert size={22} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
