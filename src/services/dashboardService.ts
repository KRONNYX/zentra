"use client";

import { supabase } from "@/lib/supabaseClient";
import { getSelectedBarId } from "@/lib/activeBar";
import { isSuperUser, normalizeRole } from "@/lib/permissions";

export type BarContext = {
  barId: string;
  barName: string;
  businessDayCutoff: string | null;
  role: string;
  source: "super_user" | "bar_memberships";
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
  business_day_cutoff?: string | null;
};

export interface MvpDashboardData {
  businessDate: string;
  grossSales: number;
  cashSales: number;
  mpesaSales: number;
  openTabsTotal: number;
  openTabsCount: number;
  lowStockCount: number;
  isTodayClosed: boolean;
  latestClosure: {
    id: string;
    business_date: string;
    expected_cash: number;
    actual_cash: number;
    expected_mpesa: number;
    actual_mpesa: number;
    stock_variance_value: number;
    profit_total: number;
    closed_at: string | null;
  } | null;
}

async function getBar(barId: string) {
  const { data } = await supabase
    .from("bars")
    .select("name, business_day_cutoff")
    .eq("id", barId)
    .limit(1)
    .maybeSingle<BarRow>();

  return {
    name: data?.name ?? "Your bar",
    businessDayCutoff: data?.business_day_cutoff ?? null,
  };
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
    .select("id, name, business_day_cutoff")
    .order("name", { ascending: true })
    .returns<Array<Required<BarRow>>>();

  return {
    bars: (data ?? []).map((bar) => ({
      id: bar.id,
      name: bar.name ?? "Unnamed bar",
      businessDayCutoff: bar.business_day_cutoff ?? null,
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
          businessDayCutoff: activeBar.businessDayCutoff,
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
    const bar = await getBar(membership.bar_id);

    return {
      barContext: {
        barId: membership.bar_id,
        barName: bar.name,
        businessDayCutoff: bar.businessDayCutoff,
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

export async function getMvpDashboardData(
  barId: string,
  businessDate: string
): Promise<MvpDashboardData> {
  const [salesRes, tabsRes, productsRes, todayClosureRes, latestClosureRes] =
    await Promise.all([
      supabase
        .from("sales")
        .select("total_amount, cash_amount, mpesa_amount")
        .eq("bar_id", barId)
        .eq("sale_date", businessDate)
        .eq("status", "paid"),
      supabase
        .from("customer_credits")
        .select("id, amount")
        .eq("bar_id", barId)
        .eq("status", "unpaid"),
      supabase
        .from("products")
        .select("id, current_stock, minimum_stock_level")
        .eq("bar_id", barId)
        .eq("is_active", true),
      supabase
        .from("daily_closures")
        .select("id, status")
        .eq("bar_id", barId)
        .eq("business_date", businessDate)
        .eq("status", "closed")
        .maybeSingle(),
      supabase
        .from("daily_closures")
        .select(
          "id, business_date, expected_cash, actual_cash, expected_mpesa, actual_mpesa, stock_variance_value, profit_total, closed_at"
        )
        .eq("bar_id", barId)
        .eq("status", "closed")
        .order("business_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const sales = salesRes.data || [];
  const grossSales = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const cashSales = sales.reduce((sum, s) => sum + Number(s.cash_amount || 0), 0);
  const mpesaSales = sales.reduce((sum, s) => sum + Number(s.mpesa_amount || 0), 0);

  const tabs = tabsRes.data || [];
  const openTabsTotal = tabs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const lowStockCount = (productsRes.data || []).filter(
    (p) => Number(p.current_stock ?? 0) <= Number(p.minimum_stock_level ?? 5)
  ).length;

  return {
    businessDate,
    grossSales,
    cashSales,
    mpesaSales,
    openTabsTotal,
    openTabsCount: tabs.length,
    lowStockCount,
    isTodayClosed: Boolean(todayClosureRes.data),
    latestClosure: latestClosureRes.data
      ? {
          id: latestClosureRes.data.id,
          business_date: latestClosureRes.data.business_date,
          expected_cash: Number(latestClosureRes.data.expected_cash || 0),
          actual_cash: Number(latestClosureRes.data.actual_cash || 0),
          expected_mpesa: Number(latestClosureRes.data.expected_mpesa || 0),
          actual_mpesa: Number(latestClosureRes.data.actual_mpesa || 0),
          stock_variance_value: Number(latestClosureRes.data.stock_variance_value || 0),
          profit_total: Number(latestClosureRes.data.profit_total || 0),
          closed_at: latestClosureRes.data.closed_at,
        }
      : null,
  };
}