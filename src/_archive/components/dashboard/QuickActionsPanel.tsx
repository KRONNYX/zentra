import Link from "next/link";
import { ClipboardCheck, PackageCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";

export default function QuickActionsPanel({
  canCloseDay,
  canUpdateInventory,
  canManageStaff,
  onCloseDay,
  onUpdateInventory,
}: {
  canCloseDay: boolean;
  canUpdateInventory: boolean;
  canManageStaff: boolean;
  onCloseDay: () => void;
  onUpdateInventory: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-bold text-slate-950">Quick Actions</h2>
        <p className="text-sm text-slate-500">The next useful thing to do</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {canCloseDay && (
          <ActionButton
            icon={<ClipboardCheck size={18} />}
            label="Close Business Day"
            onClick={onCloseDay}
            primary
          />
        )}
        {canUpdateInventory && (
          <ActionButton
            icon={<PackageCheck size={18} />}
            label="Update Inventory"
            onClick={onUpdateInventory}
          />
        )}
        <Link
          href="/bar-staff"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <UsersRound size={18} />
          {canManageStaff ? "Manage Staff" : "View Staff"}
        </Link>
      </div>

      {!canCloseDay && !canUpdateInventory && !canManageStaff && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
          Your role can view staff details, but operational actions are not
          enabled yet.
        </p>
      )}
    </section>
  );
}

function ActionButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        primary
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
