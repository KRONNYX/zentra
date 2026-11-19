'use client';

import {supabase} from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Lock,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Package,
  Banknote,
  Smartphone,
  Receipt,
} from 'lucide-react';
import { useBarContext } from '@/hooks/useBarContext';
import { getMvpDashboardData, type MvpDashboardData } from '@/services/dashboardService';
import CloseDayModal from '@/components/modals/CloseDayModal';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const router = useRouter();
  const { barContext, loading: authLoading } = useBarContext();
  const activeBar = barContext
    ? { id: barContext.barId, name: barContext.barName, role: barContext.role }
    : null;

  const [data, setData] = useState<MvpDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const businessDate = new Date().toISOString().split('T')[0];

  const loadDashboard = async () => {
    if (!activeBar?.id) return;
    setLoading(true);
    try {
      const res = await getMvpDashboardData(activeBar.id, businessDate);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [activeBar?.id]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 p-6 flex items-center justify-center text-sm">
        Loading bar overview...
      </div>
    );
  }

  const cashDiff = data?.latestClosure
    ? data.latestClosure.actual_cash - data.latestClosure.expected_cash
    : 0;
  const mpesaDiff = data?.latestClosure
    ? data.latestClosure.actual_mpesa - data.latestClosure.expected_mpesa
    : 0;
  const stockDiffKes = data?.latestClosure?.stock_variance_value || 0;
  const hasAlert = cashDiff < 0 || mpesaDiff < 0 || stockDiffKes < 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 pb-24 max-w-5xl mx-auto space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeBar?.name || 'Bar Dashboard'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Business Date: <span className="font-mono text-zinc-200">{businessDate}</span> • Role:{' '}
            <span className="uppercase font-semibold text-emerald-400">{activeBar?.role}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/orders">
            <Button className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold">
              <ShoppingCart className="w-4 h-4 mr-1.5" /> Open POS
            </Button>
          </Link>

          <Link href="/products">
            <Button variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100">
              <Package className="w-4 h-4 mr-1.5" /> Stock & Wastage
            </Button>
          </Link>

          <Button
            type="button"
            disabled={data?.isTodayClosed}
            onClick={() => setIsCloseModalOpen(true)}
            className="bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold disabled:opacity-50"
          >
            <Lock className="w-4 h-4 mr-1.5" />
            {data?.isTodayClosed ? 'Today Closed' : 'Close Day'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-100"
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/login');
            }}
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-400">Today&apos;s Paid Sales</p>
          <p className="text-xl font-extrabold font-mono text-zinc-100 mt-1.5">
            KES {(data?.grossSales || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Excludes unsettled tabs</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>M-PESA Collected</span>
            <Smartphone className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-emerald-400 mt-1.5">
            KES {(data?.mpesaSales || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Verified receipt codes</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Cash Collected</span>
            <Banknote className="w-4 h-4 text-zinc-300" />
          </div>
          <p className="text-xl font-extrabold font-mono text-zinc-100 mt-1.5">
            KES {(data?.cashSales || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Before drawer expenses</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Unpaid Open Tabs</span>
            <Receipt className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-amber-400 mt-1.5">
            KES {(data?.openTabsTotal || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {data?.openTabsCount || 0} active customer tabs
          </p>
        </div>
      </div>

      {/* Latest Reconciliation & Discrepancy Alert Panel */}
      <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Latest Closed Shift Reconciliation</h2>
          {data?.latestClosure && (
            <span className="text-xs font-mono text-zinc-400">
              Date: {data.latestClosure.business_date}
            </span>
          )}
        </div>

        {!data?.latestClosure ? (
          <p className="text-sm text-zinc-400">
            No closed business days yet. Click <strong>Close Day</strong> at the end of the shift to
            run a blind stock & cash reconciliation.
          </p>
        ) : (
          <>
            <div
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-xs font-medium ${
                hasAlert
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              }`}
            >
              {hasAlert ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>
                    Discrepancy detected on {data.latestClosure.business_date}. Review cash, M-PESA,
                    or missing bottle variances below.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>All stock, cash, and M-PESA counts balanced with zero shortages.</span>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <p className="text-xs text-zinc-400">Cash Variance</p>
                <p
                  className={`font-mono font-bold text-base mt-1 ${
                    cashDiff < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {cashDiff >= 0 ? '+' : ''}KES {cashDiff.toLocaleString()}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <p className="text-xs text-zinc-400">M-PESA Variance</p>
                <p
                  className={`font-mono font-bold text-base mt-1 ${
                    mpesaDiff < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {mpesaDiff >= 0 ? '+' : ''}KES {mpesaDiff.toLocaleString()}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <p className="text-xs text-zinc-400">Stock Variance (Retail)</p>
                <p
                  className={`font-mono font-bold text-base mt-1 ${
                    stockDiffKes < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {stockDiffKes >= 0 ? '+' : ''}KES {stockDiffKes.toLocaleString()}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <CloseDayModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        businessDate={businessDate}
        onDayClosed={() => loadDashboard()}
      />
    </div>
  );
}