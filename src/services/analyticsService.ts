"use client";

import { supabase } from "@/lib/supabaseClient";
import {
  getBarContextForUser,
  getLatestBusinessDate,
} from "@/services/dashboardService";
import {
  getUnpaidBillsForBar,
  type UnpaidBill,
} from "@/services/billingService";
import type { DatePeriod } from "@/services/dashboardService";

export type DailySubmission = {
  date: string;
  revenueTotal: number;
  mpesaTotal: number;
  cashTotal: number;
  expensesTotal: number;
  unpaidBillsTotal: number;
  unpaidBillsCount: number;
  status: "Submitted" | "Missing";
};

type DailySalesRow = {
  business_date: string | null;
  revenue_total: number | string | null;
  mpesa_total: number | string | null;
  cash_total: number | string | null;
};

type SubmissionRow = {
  business_date: string | null;
};

type ExpenseRow = {
  business_date: string | null;
  amount: number | string | null;
};

type CreditRow = {
  business_date: string | null;
  amount: number | string | null;
  status: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value) || 0;
  }

  return 0;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRange(period: DatePeriod, latestBusinessDate?: string) {
  const start =
    period === "day" && latestBusinessDate
      ? new Date(`${latestBusinessDate}T00:00:00`)
      : new Date();
  start.setHours(0, 0, 0, 0);

  if (period === "week") {
    start.setDate(start.getDate() - 6);
  }

  if (period === "month") {
    start.setDate(1);
  }

  const end = new Date(start);
  if (period === "day") {
    end.setDate(end.getDate() + 1);
  } else {
    end.setTime(new Date().setHours(24, 0, 0, 0));
  }

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

function expectedDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current < end) {
    dates.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export async function getAnalyticsDrilldown(
  userId: string,
  email: string | undefined,
  period: DatePeriod,
) {
  const { barContext, error: contextError } = await getBarContextForUser(
    userId,
    email,
  );

  if (!barContext) {
    return {
      data: null,
      error: contextError,
    };
  }

  const latestBusinessDate =
    period === "day" ? await getLatestBusinessDate(barContext.barId) : "";
  const { startDate, endDate } = getRange(period, latestBusinessDate);

  const [
    dailySalesResult,
    submissionsResult,
    expensesResult,
    creditsResult,
    unpaidBillsResult,
  ] = await Promise.all([
    supabase
      .from("daily_sales")
      .select("business_date, revenue_total, mpesa_total, cash_total")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<DailySalesRow[]>(),
    supabase
      .from("close_day_submissions")
      .select("business_date")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<SubmissionRow[]>(),
    supabase
      .from("expenses")
      .select("business_date, amount")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<ExpenseRow[]>(),
    supabase
      .from("customer_credits")
      .select("business_date, amount, status")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<CreditRow[]>(),
    getUnpaidBillsForBar(barContext.barId, latestBusinessDate || undefined),
  ]);

  const queryError =
    dailySalesResult.error ??
    submissionsResult.error ??
    expensesResult.error ??
    creditsResult.error;

  if (queryError) {
    return {
      data: null,
      error: queryError.message,
    };
  }

  if (unpaidBillsResult.error) {
    return {
      data: null,
      error: unpaidBillsResult.error,
    };
  }

  const salesByDate = new Map(
    (dailySalesResult.data ?? []).map((row) => [row.business_date ?? "", row]),
  );
  const submittedDates = new Set(
    (submissionsResult.data ?? []).map((row) => row.business_date ?? ""),
  );

  const expensesByDate = (expensesResult.data ?? []).reduce<Record<string, number>>(
    (totals, row) => {
      const date = row.business_date ?? "";
      totals[date] = (totals[date] ?? 0) + toNumber(row.amount);
      return totals;
    },
    {},
  );
  const creditsByDate = (creditsResult.data ?? [])
    .filter((row) => row.status !== "settled")
    .reduce<Record<string, { total: number; count: number }>>((totals, row) => {
      const date = row.business_date ?? "";
      const current = totals[date] ?? { total: 0, count: 0 };
      totals[date] = {
        total: current.total + toNumber(row.amount),
        count: current.count + 1,
      };
      return totals;
    }, {});

  const days: DailySubmission[] = expectedDates(startDate, endDate).map((date) => {
    const sales = salesByDate.get(date);
    const creditSummary = creditsByDate[date] ?? { total: 0, count: 0 };
    const submitted = submittedDates.has(date) || Boolean(sales);

    return {
      date,
      revenueTotal: toNumber(sales?.revenue_total),
      mpesaTotal: toNumber(sales?.mpesa_total),
      cashTotal: toNumber(sales?.cash_total),
      expensesTotal: expensesByDate[date] ?? 0,
      unpaidBillsTotal: creditSummary.total,
      unpaidBillsCount: creditSummary.count,
      status: submitted ? "Submitted" : "Missing",
    };
  });

  return {
    data: {
      days,
      unpaidBills: unpaidBillsResult.bills as UnpaidBill[],
      rangeLabel: `${startDate} to ${endDate}`,
    },
    error: "",
  };
}
