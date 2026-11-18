"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  ClipboardCheck,
  CreditCard,
  Minus,
  Smartphone,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AccessDenied from "@/components/auth/AccessDenied";
import ActivityTimeline, {
  type ActivityItem,
} from "@/components/dashboard/ActivityTimeline";
import BusinessBriefingPanel from "@/components/dashboard/BusinessBriefingPanel";
import { calculateBusinessHealth } from "@/components/dashboard/BusinessHealthScore";
import MetricCard from "@/components/dashboard/MetricCard";
import NeedsAttentionPanel from "@/components/dashboard/NeedsAttentionPanel";
import OpenBillsCard from "@/components/dashboard/OpenBillsCard";
import LiveOrdersPanel from "@/components/dashboard/LiveOrdersPanel";
import PeriodToggle from "@/components/dashboard/PeriodToggle";
import QuickActionsPanel from "@/components/dashboard/QuickActionsPanel";
import TopProductsPanel from "@/components/dashboard/TopProductsPanel";
import AccountMenu from "@/components/layout/AccountMenu";
import AppShell from "@/components/layout/AppShell";
import CloseDayModal from "@/components/modals/CloseDayModal";
import UpdateInventoryModal from "@/components/modals/UpdateInventoryModal";
import { useBarContext } from "@/hooks/useBarContext";
import { hasPermission } from "@/lib/permissions";
import { signOut } from "@/services/authService";
import {
  type Alert,
  type DailyMetrics,
  type DatePeriod,
  type MetricTrend,
  type ProductSale,
  emptyMetrics,
  formatKes,
  getDashboardDataForBar,
  periodLabel,
  periodTitle,
} from "@/services/dashboardService";
import type { UnpaidBill } from "@/services/billingService";
import {
  type CloseDaySettings,
  defaultCloseDaySettings,
} from "@/services/settingsService";

const currentDateContext = new Date().toLocaleDateString("en-KE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function TrendIndicator({ trend }: { trend: MetricTrend }) {
  const isUp = trend.direction === "up";
  const isDown = trend.direction === "down";
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        isUp
          ? "bg-green-50 text-green-700"
          : isDown
            ? "bg-red-50 text-red-700"
            : "bg-slate-100 text-slate-600"
      }`}
      title={`Compared with the previous matching period: ${formatKes(trend.previousTotal)}`}
    >
      <Icon size={14} />
      {trend.percentage}%
    </span>
  );
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function getPaymentShares(metrics: DailyMetrics) {
  if (metrics.revenueTotal <= 0) {
    return {
      mpesaShare: 0,
      cashShare: 0,
    };
  }

  return {
    mpesaShare: Math.round((metrics.mpesaTotal / metrics.revenueTotal) * 100),
    cashShare: Math.round((metrics.cashTotal / metrics.revenueTotal) * 100),
  };
}

function buildBriefing(metrics: DailyMetrics, alerts: Alert[], period: DatePeriod) {
  if (metrics.revenueTotal <= 0) {
    return "Close a business day to unlock a clear read on sales, payment mix, unpaid bills, expenses and stock movement.";
  }

  const dangerAlert = alerts.find((alert) => alert.severity === "danger");
  if (dangerAlert) {
    return dangerAlert.message;
  }

  if (metrics.billsTotal > 0) {
    return `${formatKes(metrics.billsTotal)} is still unpaid this month across ${metrics.billsCount} bill${metrics.billsCount === 1 ? "" : "s"}. Review the staff/customer notes before month end.`;
  }

  const { mpesaShare, cashShare } = getPaymentShares(metrics);

  if (cashShare > 55) {
    return `Cash is high at ${cashShare}% of revenue ${periodLabel(period)}. Review till movement and receipts.`;
  }

  return `Latest trading data shows a steady business position. M-Pesa is ${mpesaShare}% and cash is ${cashShare}% of revenue, with no urgent risk flagged.`;
}

function buildActivity(metrics: DailyMetrics, period: DatePeriod): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (metrics.revenueTotal > 0) {
    items.push({
      label: `${periodTitle(period)} revenue recorded`,
      detail: `${formatKes(metrics.revenueTotal)} captured from daily closures.`,
    });
  }

  if (metrics.submittedDays > 0) {
    items.push({
      label: "Closure submitted",
      detail: `${metrics.submittedDays} closed day${metrics.submittedDays === 1 ? "" : "s"} included in this view.`,
    });
  }

  if (metrics.billsTotal > 0) {
    items.push({
      label: "Unpaid bills carried forward",
      detail: `${formatKes(metrics.billsTotal)} remains open for this calendar month.`,
    });
  }

  if (metrics.expensesTotal > 0) {
    items.push({
      label: "Expenses captured",
      detail: `${formatKes(metrics.expensesTotal)} recorded against this period.`,
    });
  }

  return items;
}

export default function Dashboard() {
  const { loading, user, barContext } = useBarContext();
  const [period, setPeriod] = useState<DatePeriod>("day");
  const [metrics, setMetrics] = useState<DailyMetrics>(emptyMetrics);
  const [settings, setSettings] = useState<CloseDaySettings>(
    defaultCloseDaySettings,
  );
  const [topProducts, setTopProducts] = useState<ProductSale[]>([]);
  const [unpaidBills, setUnpaidBills] = useState<UnpaidBill[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [latestBusinessDate, setLatestBusinessDate] = useState("");
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [showUpdateInventory, setShowUpdateInventory] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  const health = useMemo(
    () => calculateBusinessHealth(metrics, alerts),
    [alerts, metrics],
  );
  const briefing = useMemo(
    () => buildBriefing(metrics, alerts, period),
    [alerts, metrics, period],
  );
  const activity = useMemo(() => buildActivity(metrics, period), [metrics, period]);
  const paymentShares = useMemo(() => getPaymentShares(metrics), [metrics]);
  const canCloseDay = hasPermission(barContext?.role, "close_day");
  const canUpdateInventory = hasPermission(barContext?.role, "update_inventory");
  const canManageStaff = hasPermission(barContext?.role, "manage_staff");

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  useEffect(() => {
    if (loading || !user || !barContext || !hasPermission(barContext.role, "view_home")) {
      return;
    }

    let active = true;
    const loadDashboard = async () => {
      setDataLoading(true);
      setError("");

      const { data, error: dashboardError } = await getDashboardDataForBar(barContext, period);
      if (!active) return;

      if (!data) {
        setError(dashboardError);
        setDataLoading(false);
        return;
      }

      setSettings(data.settings);
      setMetrics(data.metrics);
      setTopProducts(data.topProducts);
      setUnpaidBills(data.unpaidBills);
      setLatestBusinessDate(data.dataStatus.latestBusinessDate);
      setAlerts(data.alerts);
      setDataLoading(false);
    };

    void loadDashboard().catch(() => {
      if (active) {
        setError("Couldn’t load sales reporting. The order queue is separate.");
        setDataLoading(false);
      }
    });
    return () => { active = false; };
  }, [barContext, loading, period, refreshKey, user]);

  if (loading || !user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="h-56 animate-pulse rounded-[1.75rem] bg-white" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="h-80 animate-pulse rounded-2xl bg-white" />
            <div className="h-80 animate-pulse rounded-2xl bg-white" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!barContext || !hasPermission(barContext.role, "view_home")) {
    return (
      <AppShell>
        <AccessDenied message="Your permissions are not configured for the Home dashboard yet." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">
              {currentDateContext}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Home
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {period === "day" && latestBusinessDate
                ? `Latest Trading Day: ${latestBusinessDate}`
                : `Current reporting period: ${periodTitle(period)}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <PeriodToggle period={period} onChange={setPeriod} />
            <AccountMenu
              email={user?.email}
              role={barContext?.role}
              onSignOut={handleSignOut}
            />
          </div>
        </header>

        <LiveOrdersPanel key={barContext.barId} barId={barContext.barId} />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {dataLoading && <p role="status" className="text-sm text-slate-600">Loading sales reporting…</p>}
        <div className="space-y-6" hidden={dataLoading || Boolean(error)}>
        <BusinessBriefingPanel
          greeting={getGreeting()}
          barName={barContext?.barName ?? "Zentra"}
          message={briefing}
          health={health}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            icon={<Banknote size={20} />}
            label={`Revenue - ${periodTitle(period)}`}
            value={formatKes(metrics.revenueTotal)}
            context="Total recorded business"
            tone={metrics.revenueTotal > 0 ? "success" : "default"}
          />
          <MetricCard
            icon={<Smartphone size={20} />}
            label="M-Pesa"
            value={formatKes(metrics.mpesaTotal)}
            context="Digital collections"
            trend={<TrendIndicator trend={metrics.mpesaTrend} />}
            progress={paymentShares.mpesaShare}
            secondary={`${paymentShares.mpesaShare}% of revenue`}
          />
          <MetricCard
            icon={<CreditCard size={20} />}
            label="Cash"
            value={formatKes(metrics.cashTotal)}
            context="Till and cash drawer"
            trend={<TrendIndicator trend={metrics.cashTrend} />}
            progress={paymentShares.cashShare}
            secondary={`${paymentShares.cashShare}% of revenue`}
            tone={paymentShares.cashShare > 55 ? "warning" : "default"}
          />
          {settings.showBills && (
            <OpenBillsCard
              total={metrics.billsTotal}
              count={metrics.billsCount}
              bills={unpaidBills}
            />
          )}
          {settings.showDailyExpenses && (
            <MetricCard
              icon={<Banknote size={20} />}
              label="Expenses"
              value={formatKes(metrics.expensesTotal)}
              context={`Recorded ${periodLabel(period)}`}
              tone={
                metrics.revenueTotal > 0 &&
                metrics.expensesTotal / metrics.revenueTotal > 0.35
                  ? "warning"
                  : "default"
              }
            />
          )}
          <MetricCard
            icon={<ClipboardCheck size={20} />}
            label="Closed Days"
            value={`${metrics.submittedDays}`}
            context={`Closed ${periodLabel(period)}`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          {settings.showTopProduct && <TopProductsPanel products={topProducts} />}
          <NeedsAttentionPanel alerts={alerts} />
        </section>

        <ActivityTimeline items={activity} />
        </div>

        <QuickActionsPanel
          canCloseDay={canCloseDay}
          canUpdateInventory={canUpdateInventory}
          canManageStaff={canManageStaff}
          onCloseDay={() => setShowCloseDay(true)}
          onUpdateInventory={() => setShowUpdateInventory(true)}
        />
      </div>

      <CloseDayModal
        isOpen={showCloseDay}
        barId={barContext?.barId ?? ""}
        role={barContext?.role}
        onClose={() => setShowCloseDay(false)}
        onSuccess={() => setRefreshKey((key) => key + 1)}
      />

      <UpdateInventoryModal
        isOpen={showUpdateInventory}
        barId={barContext?.barId ?? ""}
        role={barContext?.role}
        onClose={() => setShowUpdateInventory(false)}
        onSuccess={() => setRefreshKey((key) => key + 1)}
      />
    </AppShell>
  );
}
