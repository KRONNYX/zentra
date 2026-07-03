"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DailySubmission } from "@/services/analyticsService";
import { formatKes } from "@/services/dashboardService";

export default function DailySubmissionsPanel({
  days,
}: {
  days: DailySubmission[];
}) {
  const [expandedDate, setExpandedDate] = useState("");

  function toggle(date: string) {
    setExpandedDate((current) => (current === date ? "" : date));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-bold text-slate-950">Daily Submissions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Spot closed trading days and missed submissions.
        </p>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">M-Pesa</th>
              <th className="px-4 py-3">Cash</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <DailySubmissionRows
                key={day.date}
                day={day}
                expanded={expandedDate === day.date}
                onToggle={() => toggle(day.date)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {days.map((day) => (
          <DailySubmissionCard
            key={day.date}
            day={day}
            expanded={expandedDate === day.date}
            onToggle={() => toggle(day.date)}
          />
        ))}
      </div>
    </section>
  );
}

function DailySubmissionRows({
  day,
  expanded,
  onToggle,
}: {
  day: DailySubmission;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-200">
        <td className="px-4 py-3 font-semibold text-slate-900">{day.date}</td>
        <td className="px-4 py-3">{formatKes(day.revenueTotal)}</td>
        <td className="px-4 py-3">{formatKes(day.mpesaTotal)}</td>
        <td className="px-4 py-3">{formatKes(day.cashTotal)}</td>
        <td className="px-4 py-3">
          <StatusPill status={day.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <ExpandButton expanded={expanded} onToggle={onToggle} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-200 bg-slate-50">
          <td colSpan={6} className="px-4 py-4">
            <Details day={day} />
          </td>
        </tr>
      )}
    </>
  );
}

function DailySubmissionCard({
  day,
  expanded,
  onToggle,
}: {
  day: DailySubmission;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-950">{day.date}</p>
          <p className="mt-1 text-sm text-slate-500">
            {formatKes(day.revenueTotal)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={day.status} />
          <ExpandButton expanded={expanded} onToggle={onToggle} />
        </div>
      </div>
      {expanded && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <Details day={day} />
        </div>
      )}
    </article>
  );
}

function Details({ day }: { day: DailySubmission }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <Detail label="M-Pesa" value={formatKes(day.mpesaTotal)} />
      <Detail label="Cash" value={formatKes(day.cashTotal)} />
      <Detail label="Expenses" value={formatKes(day.expensesTotal)} />
      <Detail
        label="Unpaid Bills"
        value={`${day.unpaidBillsCount} - ${formatKes(day.unpaidBillsTotal)}`}
      />
    </dl>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-slate-950">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: DailySubmission["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        status === "Submitted"
          ? "bg-green-50 text-green-700"
          : "bg-amber-50 text-amber-800"
      }`}
    >
      {status}
    </span>
  );
}

function ExpandButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={expanded ? "Collapse trading day" : "Expand trading day"}
      aria-expanded={expanded}
      onClick={onToggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <ChevronDown
        size={18}
        className={`transition ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}
