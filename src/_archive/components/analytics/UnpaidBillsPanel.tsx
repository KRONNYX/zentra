import { ReceiptText } from "lucide-react";
import type { UnpaidBill } from "@/services/billingService";
import { formatKes } from "@/services/dashboardService";

export default function UnpaidBillsPanel({ bills }: { bills: UnpaidBill[] }) {
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-950">Unpaid Bills</h2>
          <p className="mt-1 text-sm text-slate-500">
            Customer credits still open for the current billing month.
          </p>
        </div>
        <ReceiptText size={20} className="shrink-0 text-slate-400" />
      </div>

      <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <span className="font-bold">{bills.length}</span> open records -{" "}
        <span className="font-bold">{formatKes(total)}</span>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto">
        {bills.length > 0 ? (
          bills.map((bill) => (
            <article key={bill.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-950">
                    {bill.customerName}
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {bill.staffName}
                    {bill.staffId ? ` (${bill.staffId})` : ""} -{" "}
                    {bill.businessDate || "No date"}
                  </p>
                </div>
                <p className="shrink-0 font-black text-slate-950">
                  {formatKes(bill.amount)}
                </p>
              </div>
              {bill.notes && (
                <p className="mt-3 break-words text-sm text-slate-500">
                  {bill.notes}
                </p>
              )}
            </article>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            No unpaid bill records found for this billing month.
          </p>
        )}
      </div>
    </section>
  );
}
