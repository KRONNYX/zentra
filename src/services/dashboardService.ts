"use client";

import { supabase } from "@/lib/supabaseClient";
import { getSelectedBarId } from "@/lib/activeBar";
import { isSuperUser, normalizeRole } from "@/lib/permissions";
import {
  getUnpaidBillsForBar,
  type UnpaidBill,
} from "@/services/billingService";
import {
  type CloseDaySettings,
  defaultCloseDaySettings,
  getCloseDaySettings,
} from "@/services/settingsService";

export type DatePeriod = "day" | "week" | "month";

export type BarContext = {
  barId: string;
  barName: string;
  role: string;
  source: "super_user" | "bar_memberships";
};

export type MetricTrend = {
  direction: "up" | "down" | "flat";
  percentage: number;
  previousTotal: number;
};

export type DailyMetrics = {
  revenueTotal: number;
  mpesaTotal: number;
  cashTotal: number;
  billsTotal: number;
  billsCount: number;
  expensesTotal: number;
  submittedDays: number;
  mpesaTrend: MetricTrend;
  cashTrend: MetricTrend;
};

export type ProductSale = {
  productName: string;
  unitsSold: number;
};

export type Alert = {
  id: string;
  message: string;
  severity: "info" | "warning" | "danger";
};

export type DataStatus = {
  dateRange: string;
  latestBusinessDate: string;
  salesCount: number;
  saleItemsCount: number;
  inventoryCount: number;
  movementsCount: number;
  mpesaCount: number;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type MembershipRow = {
  bar_id: string;
  role: string | null;
};

type AppUserRow = {
  bar_id: string;
  role: string | null;
};

type BarRow = {
  id?: string;
  name: string | null;
};

type DailySalesRow = {
  business_date?: string | null;
  revenue_total: number | string | null;
  mpesa_total: number | string | null;
  cash_total: number | string | null;
};

type ProductSalesRow = {
  product_name: string | null;
  units_sold: number | string | null;
};

type InventoryRow = {
  id: string;
  name: string | null;
  current_stock: number | string | null;
  quantity: number | string | null;
  reorder_level: number | string | null;
};

type InventoryMovementRow = {
  id: string;
  quantity_change: number | string | null;
  quantity: number | string | null;
  movement_type: string | null;
  product_name: string | null;
};

type MpesaTransactionRow = {
  amount: number | string | null;
  status: string | null;
};

type BarAlertRow = {
  id: string;
  message: string | null;
  severity: "info" | "warning" | "danger" | null;
};

type ExpenseRow = {
  amount: number | string | null;
};

type SubmissionRow = {
  id: string;
  business_date?: string | null;
};

export const emptyMetrics: DailyMetrics = {
  revenueTotal: 0,
  mpesaTotal: 0,
  cashTotal: 0,
  billsTotal: 0,
  billsCount: 0,
  expensesTotal: 0,
  submittedDays: 0,
  mpesaTrend: {
    direction: "flat",
    percentage: 0,
    previousTotal: 0,
  },
  cashTrend: {
    direction: "flat",
    percentage: 0,
    previousTotal: 0,
  },
};

export const emptyDataStatus: DataStatus = {
  dateRange: "",
  latestBusinessDate: "",
  salesCount: 0,
  saleItemsCount: 0,
  inventoryCount: 0,
  movementsCount: 0,
  mpesaCount: 0,
};

export function formatKes(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export function periodLabel(period: DatePeriod) {
  if (period === "day") {
    return "latest trading day";
  }

  if (period === "week") {
    return "this week";
  }

  return "this month";
}

export function periodTitle(period: DatePeriod) {
  if (period === "day") {
    return "Latest Trading Day";
  }

  if (period === "week") {
    return "This Week";
  }

  return "This Month";
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value) || 0;
  }

  return 0;
}

function getDateRange(period: DatePeriod, anchorDate?: string) {
  const start = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
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
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getPreviousDateRange(period: DatePeriod, anchorDate?: string) {
  const current = getDateRange(period, anchorDate);
  const currentStart = new Date(current.startIso);
  const currentEnd = new Date(current.endIso);
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
    startIso: previousStart.toISOString(),
    endIso: previousEnd.toISOString(),
  };
}

export async function getLatestBusinessDate(barId: string) {
  const [dailySalesResult, submissionsResult] = await Promise.all([
    supabase
      .from("daily_sales")
      .select("business_date")
      .eq("bar_id", barId)
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle<{ business_date: string | null }>(),
    supabase
      .from("close_day_submissions")
      .select("business_date")
      .eq("bar_id", barId)
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle<{ business_date: string | null }>(),
  ]);

  const dates = [
    dailySalesResult.data?.business_date,
    submissionsResult.data?.business_date,
  ].filter(Boolean) as string[];

  return dates.sort().at(-1) ?? "";
}

function getTrend(currentTotal: number, previousTotal: number): MetricTrend {
  if (currentTotal === previousTotal) {
    return {
      direction: "flat",
      percentage: 0,
      previousTotal,
    };
  }

  if (previousTotal === 0) {
    return {
      direction: currentTotal > 0 ? "up" : "flat",
      percentage: currentTotal > 0 ? 100 : 0,
      previousTotal,
    };
  }

  return {
    direction: currentTotal > previousTotal ? "up" : "down",
    percentage: Math.round(
      (Math.abs(currentTotal - previousTotal) / previousTotal) * 100,
    ),
    previousTotal,
  };
}

function stockLevel(item: InventoryRow) {
  return toNumber(item.current_stock) || toNumber(item.quantity);
}

function minimumStockLevel(item: InventoryRow) {
  return toNumber(item.reorder_level);
}

function buildAlerts(
  inventory: InventoryRow[],
  movements: InventoryMovementRow[],
  mpesaTotal: number,
  cashTotal: number,
  revenueTotal: number,
  period: DatePeriod,
) {
  const lowStockAlerts = inventory
    .filter((item) => {
      const minimumStock = minimumStockLevel(item);
      return minimumStock > 0 && stockLevel(item) <= minimumStock;
    })
    .slice(0, 2)
    .map((item) => ({
      id: `low-stock-${item.id}`,
      message: `${item.name ?? "Inventory item"} stock low (${stockLevel(item)} remaining)`,
      severity: "warning" as const,
    }));

  const lossAlerts = movements
    .filter((movement) => {
      const type = movement.movement_type?.toLowerCase() ?? "";
      return type === "loss" || type === "wastage" || type === "shrinkage";
    })
    .slice(0, 2)
    .map((movement) => ({
      id: `movement-${movement.id}`,
      message: `Possible inventory loss detected (${Math.abs(toNumber(movement.quantity_change) || toNumber(movement.quantity))} ${movement.product_name ?? "product"})`,
      severity: "danger" as const,
    }));

  const shareAlerts =
    revenueTotal > 0
      ? [
          {
            id: "mpesa-share",
            message: `M-Pesa represents ${Math.round((mpesaTotal / revenueTotal) * 100)}% of revenue ${periodLabel(period)}`,
            severity: "info" as const,
          },
          {
            id: "cash-share",
            message: `Cash represents ${Math.round((cashTotal / revenueTotal) * 100)}% of revenue ${periodLabel(period)}`,
            severity: "info" as const,
          },
        ]
      : [];

  return [...lowStockAlerts, ...lossAlerts, ...shareAlerts].slice(0, 4);
}

async function getBarName(barId: string) {
  const { data } = await supabase
    .from("bars")
    .select("name")
    .eq("id", barId)
    .limit(1)
    .maybeSingle<BarRow>();

  return data?.name ?? "Your bar";
}

async function getGlobalRole(userId: string, email?: string) {
  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("bar_id, role")
    .eq("id", userId)
    .limit(1)
    .maybeSingle<AppUserRow>();

  if (appUser?.role && isSuperUser(appUser.role)) {
    return { role: "super_user", error: "" };
  }

  if (email) {
    const { data: appUserByEmail } = await supabase
      .from("users")
      .select("bar_id, role")
      .eq("email", email)
      .limit(1)
      .maybeSingle<AppUserRow>();

    if (appUserByEmail?.role && isSuperUser(appUserByEmail.role)) {
      return { role: "super_user", error: "" };
    }
  }

  return { role: "staff", error: appUserError?.message ?? "" };
}

export async function listAllBarsForSuperUser() {
  const { data, error } = await supabase
    .from("bars")
    .select("id, name")
    .order("name", { ascending: true })
    .returns<Array<{ id: string; name: string | null }>>();

  return {
    bars: (data ?? []).map((bar) => ({
      id: bar.id,
      name: bar.name ?? "Unnamed bar",
    })),
    error: error?.message ?? "",
  };
}

export async function getBarContextForUser(
  userId: string,
  email?: string,
  selectedBarId = getSelectedBarId(),
) {
  const { role: globalRole, error: appUserError } = await getGlobalRole(
    userId,
    email,
  );

  if (isSuperUser(globalRole)) {
    const { bars, error: barsError } = await listAllBarsForSuperUser();
    const activeBar =
      bars.find((bar) => bar.id === selectedBarId) ?? bars[0] ?? null;

    if (activeBar) {
      return {
        barContext: {
          barId: activeBar.id,
          barName: activeBar.name,
          role: "super_user",
          source: "super_user" as const,
        },
        error: "",
      };
    }

    return {
      barContext: null,
      error: barsError || "No bars are available for super-user administration.",
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("bar_memberships")
    .select("bar_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (membership?.bar_id) {
    return {
      barContext: {
        barId: membership.bar_id,
        barName: await getBarName(membership.bar_id),
        role: normalizeRole(membership.role),
        source: "bar_memberships" as const,
      },
      error: "",
    };
  }

  return {
    barContext: null,
    error:
      membershipError?.message ??
      appUserError ??
      "No bar membership is linked to this user yet.",
  };
}

export async function getDashboardData(
  userId: string,
  email: string | undefined,
  period: DatePeriod,
) {
  const { barContext, error: barContextError } = await getBarContextForUser(
    userId,
    email,
  );

  if (!barContext) {
    return {
      data: null,
      error: barContextError,
    };
  }

  const { settings, error: settingsError } = await getCloseDaySettings(
    barContext.barId,
  );

  if (settingsError) {
    return {
      data: null,
      error: settingsError,
    };
  }

  const latestBusinessDate =
    period === "day" ? await getLatestBusinessDate(barContext.barId) : "";
  const { startDate, endDate, startIso, endIso } = getDateRange(
    period,
    latestBusinessDate || undefined,
  );
  const previousRange = getPreviousDateRange(
    period,
    latestBusinessDate || undefined,
  );

  const [
    dailySalesResult,
    previousDailySalesResult,
    productSalesResult,
    alertsResult,
    inventoryResult,
    movementsResult,
    mpesaResult,
    previousMpesaResult,
    expensesResult,
    submissionsResult,
    unpaidBillsResult,
  ] = await Promise.all([
    supabase
      .from("daily_sales")
      .select("revenue_total, mpesa_total, cash_total")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<DailySalesRow[]>(),
    supabase
      .from("daily_sales")
      .select("revenue_total, mpesa_total, cash_total")
      .eq("bar_id", barContext.barId)
      .gte("business_date", previousRange.startDate)
      .lt("business_date", previousRange.endDate)
      .returns<DailySalesRow[]>(),
    supabase
      .from("product_sales")
      .select("product_name, units_sold")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<ProductSalesRow[]>(),
    supabase
      .from("bar_alerts")
      .select("id, message, severity")
      .eq("bar_id", barContext.barId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(4)
      .returns<BarAlertRow[]>(),
    supabase
      .from("inventory")
      .select("id, name, current_stock, quantity, reorder_level")
      .eq("bar_id", barContext.barId)
      .returns<InventoryRow[]>(),
    supabase
      .from("inventory_movements")
      .select("id, quantity_change, quantity, movement_type, product_name")
      .eq("bar_id", barContext.barId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<InventoryMovementRow[]>(),
    supabase
      .from("mpesa_transactions")
      .select("amount, status")
      .eq("bar_id", barContext.barId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .returns<MpesaTransactionRow[]>(),
    supabase
      .from("mpesa_transactions")
      .select("amount, status")
      .eq("bar_id", barContext.barId)
      .gte("created_at", previousRange.startIso)
      .lt("created_at", previousRange.endIso)
      .returns<MpesaTransactionRow[]>(),
    supabase
      .from("expenses")
      .select("amount")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<ExpenseRow[]>(),
    supabase
      .from("close_day_submissions")
      .select("id, business_date")
      .eq("bar_id", barContext.barId)
      .gte("business_date", startDate)
      .lt("business_date", endDate)
      .returns<SubmissionRow[]>(),
    getUnpaidBillsForBar(barContext.barId, latestBusinessDate || undefined),
  ]);

  const queryError = [
    dailySalesResult,
    previousDailySalesResult,
    productSalesResult,
    alertsResult,
    inventoryResult,
    movementsResult,
    mpesaResult,
    previousMpesaResult,
    expensesResult,
    submissionsResult,
  ].find((result) => "error" in result && result.error)?.error;

  if (queryError) {
    return {
      data: null,
      error:
        typeof queryError === "string" ? queryError : queryError.message,
    };
  }

  if (unpaidBillsResult.error) {
    return {
      data: null,
      error: unpaidBillsResult.error,
    };
  }

  const dailySales = (dailySalesResult as QueryResult<DailySalesRow[]>).data ?? [];
  const previousDailySales =
    (previousDailySalesResult as QueryResult<DailySalesRow[]>).data ?? [];
  const productSales =
    (productSalesResult as QueryResult<ProductSalesRow[]>).data ?? [];
  const alerts = (alertsResult as QueryResult<BarAlertRow[]>).data ?? [];
  const inventory = (inventoryResult as QueryResult<InventoryRow[]>).data ?? [];
  const movements =
    (movementsResult as QueryResult<InventoryMovementRow[]>).data ?? [];
  const mpesaTransactions =
    (mpesaResult as QueryResult<MpesaTransactionRow[]>).data ?? [];
  const previousMpesaTransactions =
    (previousMpesaResult as QueryResult<MpesaTransactionRow[]>).data ?? [];
  const expenses = (expensesResult as QueryResult<ExpenseRow[]>).data ?? [];
  const submissions =
    (submissionsResult as QueryResult<SubmissionRow[]>).data ?? [];
  const unpaidBills: UnpaidBill[] = unpaidBillsResult.bills;

  const revenueTotal = dailySales.reduce(
    (total, day) => total + toNumber(day.revenue_total),
    0,
  );
  const cashTotal = dailySales.reduce(
    (total, day) => total + toNumber(day.cash_total),
    0,
  );
  const mpesaFromDailySales = dailySales.reduce(
    (total, day) => total + toNumber(day.mpesa_total),
    0,
  );
  const previousCashTotal = previousDailySales.reduce(
    (total, day) => total + toNumber(day.cash_total),
    0,
  );
  const previousMpesaFromDailySales = previousDailySales.reduce(
    (total, day) => total + toNumber(day.mpesa_total),
    0,
  );
  const mpesaFromTransactions = mpesaTransactions
    .filter((transaction) => {
      const status = transaction.status?.toLowerCase();
      return !status || status === "completed" || status === "success";
    })
    .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
  const previousMpesaFromTransactions = previousMpesaTransactions
    .filter((transaction) => {
      const status = transaction.status?.toLowerCase();
      return !status || status === "completed" || status === "success";
    })
    .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
  const mpesaTotal = mpesaFromDailySales || mpesaFromTransactions;
  const previousMpesaTotal =
    previousMpesaFromDailySales || previousMpesaFromTransactions;
  const billsTotal = unpaidBills.reduce((total, bill) => total + bill.amount, 0);
  const billsCount = unpaidBills.length;
  const expensesTotal = expenses.reduce(
    (total, expense) => total + toNumber(expense.amount),
    0,
  );

  const topProducts = productSales
    .reduce<Record<string, number>>((products, item) => {
      const productName = item.product_name ?? "Unnamed product";
      products[productName] =
        (products[productName] ?? 0) + toNumber(item.units_sold);
      return products;
    }, {});

  const closureAlerts = alerts.map((alert) => ({
    id: alert.id,
    message: alert.message ?? "Daily closure note",
    severity: alert.severity ?? "info",
  }));

  return {
    data: {
      barContext,
      settings: settings satisfies CloseDaySettings,
      metrics: {
        revenueTotal,
        mpesaTotal,
        cashTotal,
        billsTotal,
        billsCount,
        expensesTotal,
        submittedDays: submissions.length,
        mpesaTrend: getTrend(mpesaTotal, previousMpesaTotal),
        cashTrend: getTrend(cashTotal, previousCashTotal),
      },
      topProducts: settings.showTopProduct
        ? Object.entries(topProducts)
            .map(([productName, unitsSold]) => ({ productName, unitsSold }))
            .sort((a, b) => b.unitsSold - a.unitsSold)
            .slice(0, 3)
        : [],
      alerts: [
        ...closureAlerts,
        ...buildAlerts(inventory, movements, mpesaTotal, cashTotal, revenueTotal, period),
      ].slice(0, 4),
      dataStatus: {
        dateRange: `${startDate} to ${endDate}`,
        latestBusinessDate,
        salesCount: dailySales.length,
        saleItemsCount: productSales.length,
        inventoryCount: inventory.length,
        movementsCount: movements.length,
        mpesaCount: mpesaTransactions.length,
      },
      unpaidBills,
    },
    error: "",
  };
}

export { defaultCloseDaySettings };
