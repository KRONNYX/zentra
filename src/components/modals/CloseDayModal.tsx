'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Search,
  ClipboardCheck,
  Banknote,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { useBarContext } from '@/hooks/useBarContext';
import { dailyClosureService } from '@/services/dailyClosureService';
import { BlindProductCountRow, DailyClosureReport } from '@/types/dailyClosure';
import { Button } from '@/components/ui/button';

interface CloseDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessDate?: string;
  onDayClosed?: (report: DailyClosureReport) => void;
}

export function CloseDayModal({
  isOpen,
  onClose,
  businessDate: propDate,
  onDayClosed,
}: CloseDayModalProps) {
  // NEW
  const { barContext } = useBarContext();
  const activeBar = barContext
  ? { id: barContext.barId, name: barContext.barName }
  : null;
  const businessDate = propDate || new Date().toISOString().split('T')[0];

  const [step, setStep] = useState<'count' | 'tenders' | 'report'>('count');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Blind Stock Count State
  const [rows, setRows] = useState<BlindProductCountRow[]>([]);
  const [search, setSearch] = useState('');

  // Step 2: Blind Cash & M-PESA State
  const [openingCash, setOpeningCash] = useState('0');
  const [actualCash, setActualCash] = useState('');
  const [actualMpesa, setActualMpesa] = useState('');
  const [notes, setNotes] = useState('');

  // Step 3: Post-Closure Variance Report
  const [report, setReport] = useState<DailyClosureReport | null>(null);

  useEffect(() => {
    if (!isOpen || !activeBar?.id) return;

    const init = async () => {
      setLoading(true);
      setError(null);
      setStep('count');
      setReport(null);
      setActualCash('');
      setActualMpesa('');
      setNotes('');

      try {
        const [sheet, suggestedFloat] = await Promise.all([
          dailyClosureService.getBlindCountSheet(activeBar.id),
          dailyClosureService.getSuggestedOpeningCash(activeBar.id, businessDate),
        ]);
        setRows(sheet);
        setOpeningCash(String(suggestedFloat));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [isOpen, activeBar?.id, businessDate]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [rows, search]);

  const countedProducts = useMemo(
    () => rows.filter((r) => r.actual_closing_stock !== '' && r.actual_closing_stock !== null),
    [rows]
  );

  const updateCount = (productId: string, rawVal: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.product_id !== productId) return row;
        if (rawVal === '') return { ...row, actual_closing_stock: '' };
        const num = Math.max(0, Number(rawVal));
        return { ...row, actual_closing_stock: Number.isNaN(num) ? '' : num };
      })
    );
  };

  const handleProceedToTenders = () => {
    setError(null);
    if (countedProducts.length < rows.length) {
      setError(
        `Please enter a physical count for all ${rows.length} products (${
          rows.length - countedProducts.length
        } remaining). Enter 0 if empty.`
      );
      return;
    }
    setStep('tenders');
  };

  const handleFinalCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBar?.id) return;

    if (actualCash === '' || actualMpesa === '') {
      setError('Enter both counted Cash in Drawer and actual M-PESA total.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const closedReport = await dailyClosureService.submitCloseBusinessDay({
        barId: activeBar.id,
        businessDate,
        openingCash: Number(openingCash || 0),
        actualCash: Number(actualCash),
        actualMpesa: Number(actualMpesa),
        blindCounts: rows.map((r) => ({
          product_id: r.product_id,
          actual_closing_stock: Number(r.actual_closing_stock || 0),
        })),
        notes,
      });

      setReport(closedReport);
      setStep('report');
      onDayClosed?.(closedReport);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const cashVariance = report ? report.actual_cash - report.expected_cash : 0;
  const mpesaVariance = report ? report.actual_mpesa - report.expected_mpesa : 0;
  const discrepantItems = report
    ? report.items.filter((item) => item.variance_stock !== 0)
    : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-t-3xl md:rounded-3xl flex flex-col max-h-[92vh] text-zinc-100"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <h2 className="text-lg font-bold">
                  {step === 'report' ? 'Day Closed & Locked' : 'Close Business Day'}
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {activeBar?.name} • Date: <span className="font-mono">{businessDate}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Pill */}
          {step !== 'report' && (
            <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-zinc-800 flex items-center gap-3 text-xs">
              <span
                className={`flex items-center gap-1.5 font-semibold ${
                  step === 'count' ? 'text-emerald-400' : 'text-zinc-400'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                1. Blind Stock Count ({countedProducts.length}/{rows.length})
              </span>
              <span className="text-zinc-600">&rarr;</span>
              <span
                className={`flex items-center gap-1.5 font-semibold ${
                  step === 'tenders' ? 'text-emerald-400' : 'text-zinc-400'
                }`}
              >
                <Banknote className="w-4 h-4" />
                2. Cash & M-PESA Count
              </span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* BODY */}
          <div className="p-5 overflow-y-auto flex-1">
            {loading ? (
              <div className="py-12 text-center text-sm text-zinc-400">
                Preparing blind count sheet...
              </div>
            ) : step === 'count' ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                  <strong>Blind Count Mode:</strong> Count physical bottles/cans on shelves and in
                  fridges. Expected system quantities remain hidden until the day is locked.
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter products..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/40">
                  {filteredRows.map((row) => (
                    <div
                      key={row.product_id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{row.name}</p>
                        <p className="text-[11px] text-zinc-500 uppercase">
                          {row.category} • {row.unit}s
                        </p>
                      </div>

                      <input
                        type="number"
                        min={0}
                        step="1"
                        inputMode="numeric"
                        placeholder="Qty"
                        value={row.actual_closing_stock}
                        onChange={(e) => updateCount(row.product_id, e.target.value)}
                        className={`w-24 text-right font-mono font-bold text-base rounded-xl px-3 py-2 border focus:outline-none ${
                          row.actual_closing_stock !== ''
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-100'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : step === 'tenders' ? (
              <form id="close-day-form" onSubmit={handleFinalCloseSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400">
                  Count physical cash in the drawer and check your M-PESA Till/Paybill balance for{' '}
                  <strong className="text-zinc-200">{businessDate}</strong>. Once submitted, all
                  sales and stock logs for this date are permanently locked.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Opening Cash Float (KES)
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={openingCash}
                      onChange={(e) => setOpeningCash(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Actual Cash Counted (KES) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Actual M-PESA Total (KES) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={actualMpesa}
                      onChange={(e) => setActualMpesa(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Shift Notes / Discrepancy Explanation (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Note any broken bottles, power outages, or till delays..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
              </form>
            ) : (
              /* STEP 3: POST-LOCK VARIANCE REPORT */
              report && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Reconciliation complete. Business date {report.business_date} is now locked.</span>
                  </div>

                  {/* Financial Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                      <p className="text-xs text-zinc-400">Cash Variance</p>
                      <p
                        className={`text-lg font-extrabold font-mono mt-1 ${
                          cashVariance < 0
                            ? 'text-rose-400'
                            : cashVariance > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {cashVariance >= 0 ? '+' : ''}KES {cashVariance.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Exp: {report.expected_cash.toLocaleString()} | Act:{' '}
                        {report.actual_cash.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                      <p className="text-xs text-zinc-400">M-PESA Variance</p>
                      <p
                        className={`text-lg font-extrabold font-mono mt-1 ${
                          mpesaVariance < 0
                            ? 'text-rose-400'
                            : mpesaVariance > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {mpesaVariance >= 0 ? '+' : ''}KES {mpesaVariance.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Exp: {report.expected_mpesa.toLocaleString()} | Act:{' '}
                        {report.actual_mpesa.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                      <p className="text-xs text-zinc-400">Stock Variance (Retail)</p>
                      <p
                        className={`text-lg font-extrabold font-mono mt-1 ${
                          report.stock_variance_value < 0
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {report.stock_variance_value >= 0 ? '+' : ''}KES{' '}
                        {report.stock_variance_value.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Gross Profit: KES {report.profit_total.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Stock Discrepancy Table */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                      Stock Variance Breakdown ({discrepantItems.length} items with variance)
                    </h3>
                    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                          <tr>
                            <th className="py-2.5 px-3">Product</th>
                            <th className="py-2.5 px-2 text-right">Open</th>
                            <th className="py-2.5 px-2 text-right">In</th>
                            <th className="py-2.5 px-2 text-right">Sold</th>
                            <th className="py-2.5 px-2 text-right">Exp</th>
                            <th className="py-2.5 px-2 text-right">Count</th>
                            <th className="py-2.5 px-3 text-right">Diff</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                          {report.items.map((item) => (
                            <tr
                              key={item.id}
                              className={item.variance_stock < 0 ? 'bg-rose-500/10' : ''}
                            >
                              <td className="py-2 px-3 font-medium">{item.product_name}</td>
                              <td className="py-2 px-2 text-right font-mono">{item.opening_stock}</td>
                              <td className="py-2 px-2 text-right font-mono">{item.purchased_stock}</td>
                              <td className="py-2 px-2 text-right font-mono">{item.quantity_sold}</td>
                              <td className="py-2 px-2 text-right font-mono">
                                {item.expected_closing_stock}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{item.closing_stock}</td>
                              <td
                                className={`py-2 px-3 text-right font-mono font-bold ${
                                  item.variance_stock < 0
                                    ? 'text-rose-400'
                                    : item.variance_stock > 0
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                                }`}
                              >
                                {item.variance_stock > 0 ? `+${item.variance_stock}` : item.variance_stock}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {/* FOOTER */}
          <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
            {step === 'count' && (
              <>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleProceedToTenders}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold"
                >
                  Next: Cash & M-PESA <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </>
            )}

            {step === 'tenders' && (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep('count')}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Stock Count
                </Button>
                <Button
                  type="submit"
                  form="close-day-form"
                  disabled={submitting}
                  className="bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold"
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  {submitting ? 'Locking Day...' : 'Lock & Close Business Day'}
                </Button>
              </>
            )}

            {step === 'report' && (
              <Button
                type="button"
                onClick={onClose}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold"
              >
                Done
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
export default CloseDayModal;