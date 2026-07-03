"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { closeBusinessDay } from "@/services/dailyClosureService";
import {
  getUnpaidBillsForBar,
  type BillSettlement,
  type PaymentMethod,
  type UnpaidBill,
} from "@/services/billingService";
import {
  type CloseDaySettings,
  defaultCloseDaySettings,
  getCloseDaySettings,
} from "@/services/settingsService";
import {
  getActiveStaffForBar,
  type StaffMember,
} from "@/services/barStaffService";
import { formatKes } from "@/services/dashboardService";
import type { CustomerCredit, ExpenseEntry } from "@/types/dailyClosure";
import {
  Banknote,
  CalendarDays,
  FileImage,
  FileText,
  Plus,
  ReceiptText,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

interface CloseDayModalProps {
  isOpen: boolean;
  barId: string;
  role?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const emptyCredit: CustomerCredit = {
  customerName: "",
  staffName: "",
  staffId: "",
  amount: 0,
  notes: "",
};

const emptyExpense: ExpenseEntry = {
  expenseType: "",
  description: "",
  amount: 0,
};

export default function CloseDayModal({
  isOpen,
  barId,
  role,
  onClose,
  onSuccess,
}: CloseDayModalProps) {
  const [settings, setSettings] = useState<CloseDaySettings>(
    defaultCloseDaySettings,
  );
  const [date, setDate] = useState("");
  const [cashSales, setCashSales] = useState("");
  const [mpesaSales, setMpesaSales] = useState("");
  const [credits, setCredits] = useState<CustomerCredit[]>([]);
  const [openCredits, setOpenCredits] = useState<UnpaidBill[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember[]>([]);
  const [settlements, setSettlements] = useState<Record<string, PaymentMethod>>({});
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [ledgerPhoto, setLedgerPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen || !barId) {
      return;
    }

    const loadSettings = async () => {
      const [{ settings: nextSettings }, { staff: nextStaff }] =
        await Promise.all([
          getCloseDaySettings(barId),
          getActiveStaffForBar(barId),
        ]);
      setSettings(nextSettings);
      setActiveStaff(nextStaff);
    };

    loadSettings();
  }, [barId, isOpen]);

  useEffect(() => {
    if (!isOpen || !barId || !date || !settings.showBills) {
      return;
    }

    let cancelled = false;

    const loadOpenCredits = async () => {
      const { bills: nextCredits } = await getUnpaidBillsForBar(barId, date);

      if (!cancelled) {
        setOpenCredits(nextCredits);
        setSettlements({});
      }
    };

    loadOpenCredits();

    return () => {
      cancelled = true;
    };
  }, [barId, date, isOpen, settings.showBills]);

  if (!isOpen) {
    return null;
  }

  function resetForm() {
    setDate("");
    setCashSales("");
    setMpesaSales("");
    setCredits([]);
    setOpenCredits([]);
    setSettlements({});
    setExpenses([]);
    setNotes("");
    setLedgerPhoto(null);
    setErrorMessage("");
  }

  async function handleCloseDay() {
    setSaving(true);
    setErrorMessage("");

    try {
      const settledBills = getSelectedSettlements(openCredits, settlements);
      const { error } = await closeBusinessDay({
        barId,
        businessDate: date,
        cashSales: Number(cashSales) || 0,
        mpesaSales: Number(mpesaSales) || 0,
        notes,
        products: [],
        credits: credits.filter(
          (credit) =>
            credit.staffName.trim() &&
            credit.customerName.trim() &&
            credit.amount > 0,
        ),
        settledBills,
        expenses: expenses.filter(
          (expense) => expense.expenseType.trim() && expense.amount > 0,
        ),
        ledgerPhoto: settings.showLedgerPhoto ? ledgerPhoto : null,
        role,
      });

      if (error) {
        setErrorMessage(error);
        return;
      }

      onSuccess?.();
      onClose();
      resetForm();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to close business day.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateCredit(index: number, credit: CustomerCredit) {
    setCredits((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? credit : item)),
    );
  }

  function updateCreditStaff(index: number, staffId: string) {
    const member = activeStaff.find((item) => item.id === staffId);

    updateCredit(index, {
      ...credits[index],
      staffId: member?.id ?? "",
      staffName: member?.name ?? "",
    });
  }

  function updateExpense(index: number, expense: ExpenseEntry) {
    setExpenses((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? expense : item)),
    );
  }

  function updateDate(nextDate: string) {
    setDate(nextDate);
    setOpenCredits([]);
    setSettlements({});
  }

  function toggleSettlement(creditId: string) {
    setSettlements((current) => {
      if (current[creditId]) {
        const next = { ...current };
        delete next[creditId];
        return next;
      }

      return {
        ...current,
        [creditId]: "cash",
      };
    });
  }

  function updateSettlementMethod(creditId: string, paymentMethod: PaymentMethod) {
    setSettlements((current) => ({
      ...current,
      [creditId]: paymentMethod,
    }));
  }

  const selectedSettlements = getSelectedSettlements(openCredits, settlements);
  const settledCashTotal = selectedSettlements
    .filter((settlement) => settlement.paymentMethod === "cash")
    .reduce((total, settlement) => total + settlement.amount, 0);
  const settledMpesaTotal = selectedSettlements
    .filter((settlement) => settlement.paymentMethod === "mpesa")
    .reduce((total, settlement) => total + settlement.amount, 0);
  const settledTotal = settledCashTotal + settledMpesaTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">
              Daily Closure
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submit payment totals, bills, expenses and notes.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close daily closure modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <FormField icon={<CalendarDays size={20} />} label="Business Date">
            <input
              type="date"
              value={date}
              onChange={(event) => updateDate(event.target.value)}
              className="input"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField icon={<Smartphone size={20} />} label="M-Pesa Total">
              <input
                type="number"
                value={mpesaSales}
                onChange={(event) => setMpesaSales(event.target.value)}
                placeholder="0.00"
                className="input"
              />
            </FormField>

            <FormField icon={<Banknote size={20} />} label="Cash Total">
              <input
                type="number"
                value={cashSales}
                onChange={(event) => setCashSales(event.target.value)}
                placeholder="0.00"
                className="input"
              />
            </FormField>
          </div>

          {settings.showBills && (
            <section className="space-y-3">
              {openCredits.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Settle Carried Bills
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mark unpaid bills settled for this business date.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {openCredits.map((credit) => {
                      const paymentMethod = settlements[credit.id];
                      const isSettled = Boolean(paymentMethod);

                      return (
                        <label
                          key={credit.id}
                          className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={isSettled}
                            onChange={() => toggleSettlement(credit.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">
                              {credit.customerName}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {credit.staffName}
                              {credit.staffId ? ` (${credit.staffId})` : ""} -
                              {" "}
                              {credit.businessDate}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-slate-900">
                            {new Intl.NumberFormat("en-KE", {
                              style: "currency",
                              currency: "KES",
                              maximumFractionDigits: 0,
                            }).format(credit.amount)}
                          </span>
                          {isSettled && (
                            <select
                              value={paymentMethod}
                              onChange={(event) =>
                                updateSettlementMethod(
                                  credit.id,
                                  event.target.value as PaymentMethod,
                                )
                              }
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                              aria-label={`Payment method for ${credit.customerName}`}
                            >
                              <option value="cash">Cash</option>
                              <option value="mpesa">M-Pesa</option>
                            </select>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {settledTotal > 0 && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                      <p className="font-bold">Settlement total</p>
                      <p className="mt-1 text-xs">
                        Cash: {formatKes(settledCashTotal)} - M-Pesa:{" "}
                        {formatKes(settledMpesaTotal)} - Total:{" "}
                        {formatKes(settledTotal)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <SectionHeader
                icon={<UserRound size={18} />}
                title="Unpaid Bills"
                onAdd={() =>
                  setCredits((current) => [...current, { ...emptyCredit }])
                }
              />

              {credits.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No new unpaid bills to carry forward.
                </p>
              ) : (
                <div className="space-y-3">
                  {credits.map((credit, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
                    >
                      {activeStaff.length > 0 ? (
                        <select
                          value={credit.staffId ?? ""}
                          onChange={(event) =>
                            updateCreditStaff(index, event.target.value)
                          }
                          className="input"
                          aria-label="Responsible staff"
                        >
                          <option value="">Choose staff</option>
                          {activeStaff.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                              {member.staffCode ? ` (${member.staffCode})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={credit.staffName}
                          onChange={(event) =>
                            updateCredit(index, {
                              ...credit,
                              staffName: event.target.value,
                            })
                          }
                          placeholder="Staff name or ID"
                          className="input"
                        />
                      )}
                      <input
                        value={credit.customerName}
                        onChange={(event) =>
                          updateCredit(index, {
                            ...credit,
                            customerName: event.target.value,
                          })
                        }
                        placeholder="Customer name"
                        className="input"
                      />
                      <input
                        type="number"
                        value={credit.amount || ""}
                        onChange={(event) =>
                          updateCredit(index, {
                            ...credit,
                            amount: Number(event.target.value) || 0,
                          })
                        }
                        placeholder="Amount"
                        className="input"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCredits((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50"
                        aria-label="Remove bill"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {settings.showDailyExpenses && (
            <section className="space-y-3">
              <SectionHeader
                icon={<ReceiptText size={18} />}
                title="Daily Expenses"
                onAdd={() =>
                  setExpenses((current) => [...current, { ...emptyExpense }])
                }
              />

              {expenses.length === 0 ? (
                <p className="text-sm text-slate-500">No expenses added.</p>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
                    >
                      <input
                        list="expense-options"
                        value={expense.expenseType}
                        onChange={(event) =>
                          updateExpense(index, {
                            ...expense,
                            expenseType: event.target.value,
                          })
                        }
                        placeholder="Expense type"
                        className="input"
                      />
                      <input
                        value={expense.description}
                        onChange={(event) =>
                          updateExpense(index, {
                            ...expense,
                            description: event.target.value,
                          })
                        }
                        placeholder="Description"
                        className="input"
                      />
                      <input
                        type="number"
                        value={expense.amount || ""}
                        onChange={(event) =>
                          updateExpense(index, {
                            ...expense,
                            amount: Number(event.target.value) || 0,
                          })
                        }
                        placeholder="Cost"
                        className="input"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExpenses((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50"
                        aria-label="Remove expense"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <datalist id="expense-options">
                {settings.expenseOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </section>
          )}

          <FormField icon={<FileText size={20} />} label="Notes">
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="input resize-none"
              placeholder="Optional comments for the owner"
            />
          </FormField>

          {settings.showLedgerPhoto && (
            <FormField icon={<FileImage size={20} />} label="Ledger Photo">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setLedgerPhoto(event.target.files?.[0] ?? null)}
                className="input"
              />
            </FormField>
          )}

          {errorMessage && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white p-4 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleCloseDay}
            className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
          >
            {saving ? "Closing Day..." : "Submit Close Day"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  onAdd,
}: {
  icon: ReactNode;
  title: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-blue-600">{icon}</span>
        {title}
      </h3>
      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Plus size={16} />
        Add
      </button>
    </div>
  );
}

function FormField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <span className="text-blue-600">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function getSelectedSettlements(
  bills: UnpaidBill[],
  settlements: Record<string, PaymentMethod>,
): BillSettlement[] {
  return bills
    .filter((bill) => settlements[bill.id])
    .map((bill) => ({
      id: bill.id,
      amount: bill.amount,
      paymentMethod: settlements[bill.id],
    }));
}
