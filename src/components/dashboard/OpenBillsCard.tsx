"use client";

import { useState } from "react";
import { ChevronDown, ReceiptText } from "lucide-react";
import { formatKes } from "@/services/dashboardService";
import type { UnpaidBill } from "@/services/billingService";

export default function OpenBillsCard({
  total,
  count,
  bills,
}: {
  total: number;
  count: number;
  bills: UnpaidBill[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasBills = total > 0 || count > 0;

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        hasBills ? "border-amber-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <ReceiptText size={20} />
        </div>
        <button
          type="button"
          aria-label={expanded ? "Hide open bill details" : "Show open bill details"}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronDown
            size={18}
            className={`transition ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-500">Open Bills</p>
      <p className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">
        {formatKes(total)}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {count} unpaid bill{count === 1 ? "" : "s"} this month
      </p>

      {expanded && (
        <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {bills.length > 0 ? (
            <div className="space-y-2">
              {bills.map((bill) => (
                <div
                  key={bill.id}
                  className="min-w-0 rounded-lg bg-white/70 p-3 shadow-sm"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">
                        {bill.customerName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {bill.staffName}
                        {bill.staffId ? ` (${bill.staffId})` : ""} -{" "}
                        {bill.businessDate || "No date"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-slate-950">
                      {formatKes(bill.amount)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs capitalize text-amber-800">
                    {bill.status}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-5 text-amber-800">
              Detailed bill records are not connected for this summary yet.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
