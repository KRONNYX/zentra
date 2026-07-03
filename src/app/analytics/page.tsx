"use client";

import { useEffect, useState } from "react";
import DailySubmissionsPanel from "@/components/analytics/DailySubmissionsPanel";
import AccessDenied from "@/components/auth/AccessDenied";
import IntelligenceFindingsPanel from "@/components/analytics/IntelligenceFindingsPanel";
import PaymentSplitPanel from "@/components/analytics/PaymentSplitPanel";
import ProductPerformancePanel from "@/components/analytics/ProductPerformancePanel";
import RevenueSnapshot from "@/components/analytics/RevenueSnapshot";
import UnpaidBillsPanel from "@/components/analytics/UnpaidBillsPanel";
import PeriodToggle from "@/components/dashboard/PeriodToggle";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import {
  type Alert,
  type BarContext,
  type DailyMetrics,
  type DatePeriod,
  type ProductSale,
  emptyMetrics,
  getDashboardData,
  periodLabel,
} from "@/services/dashboardService";
import {
  getAnalyticsDrilldown,
  type DailySubmission,
} from "@/services/analyticsService";
import type { UnpaidBill } from "@/services/billingService";

export default function AnalyticsPage() {
  const { loading, user } = useAuth();
  const [period, setPeriod] = useState<DatePeriod>("day");
  const [metrics, setMetrics] = useState<DailyMetrics>(emptyMetrics);
  const [topProducts, setTopProducts] = useState<ProductSale[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dailySubmissions, setDailySubmissions] = useState<DailySubmission[]>([]);
  const [unpaidBills, setUnpaidBills] = useState<UnpaidBill[]>([]);
  const [barContext, setBarContext] = useState<BarContext | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const loadAnalytics = async () => {
      setDataLoading(true);
      setError("");

      const [dashboardResult, drilldownResult] = await Promise.all([
        getDashboardData(user.id, user.email, period),
        getAnalyticsDrilldown(user.id, user.email, period),
      ]);

      if (!dashboardResult.data) {
        setError(dashboardResult.error);
        setDataLoading(false);
        return;
      }

      if (!drilldownResult.data) {
        setError(drilldownResult.error);
        setDataLoading(false);
        return;
      }

      setMetrics(dashboardResult.data.metrics);
      setBarContext(dashboardResult.data.barContext);
      setTopProducts(dashboardResult.data.topProducts);
      setAlerts(dashboardResult.data.alerts);
      setDailySubmissions(drilldownResult.data.days);
      setUnpaidBills(drilldownResult.data.unpaidBills);
      setDataLoading(false);
    };

    loadAnalytics();
  }, [loading, period, user]);

  if (loading || dataLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="h-24 animate-pulse rounded-2xl bg-white" />
          <div className="h-80 animate-pulse rounded-2xl bg-white" />
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="h-72 animate-pulse rounded-2xl bg-white" />
            <div className="h-72 animate-pulse rounded-2xl bg-white" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!hasPermission(barContext?.role, "view_analytics")) {
    return (
      <AppShell>
        <AccessDenied message="Your permissions are not configured for Analytics yet." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Owner view</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Data Analytics
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Understand sales, payment mix, product movement and unusual
              activity for {periodLabel(period)}.
            </p>
          </div>

          <PeriodToggle period={period} onChange={setPeriod} />
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <RevenueSnapshot metrics={metrics} period={period} />

        <DailySubmissionsPanel days={dailySubmissions} />

        <section className="grid gap-4 xl:grid-cols-2">
          <ProductPerformancePanel products={topProducts} />
          <PaymentSplitPanel metrics={metrics} />
        </section>

        <UnpaidBillsPanel bills={unpaidBills} />

        <IntelligenceFindingsPanel alerts={alerts} metrics={metrics} />
      </div>
    </AppShell>
  );
}
