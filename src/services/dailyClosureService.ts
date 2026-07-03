"use client";

import { supabase } from "@/lib/supabaseClient";
import { hasPermission } from "@/lib/permissions";
import { type BillSettlement } from "@/services/billingService";
import type {
  CustomerCredit,
  ExpenseEntry,
  ProductClosure,
} from "@/types/dailyClosure";

type CloseBusinessDayInput = {
  barId: string;
  businessDate: string;
  cashSales: number;
  mpesaSales: number;
  notes: string;
  products: ProductClosure[];
  credits: CustomerCredit[];
  settledCreditIds?: string[];
  settledBills?: BillSettlement[];
  expenses: ExpenseEntry[];
  ledgerPhoto?: File | null;
  role?: string | null;
};

export type OpenCustomerCredit = {
  id: string;
  businessDate: string;
  customerName: string;
  staffName: string;
  staffId: string;
  amount: number;
  notes: string;
};

type OpenCustomerCreditRow = {
  id: string;
  business_date: string | null;
  customer_name: string | null;
  staff_name: string | null;
  staff_id: string | null;
  amount: number | string | null;
  notes: string | null;
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

function mapCloseDayError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already been closed") ||
    normalized.includes("duplicate key")
  ) {
    return "This trading day has already been closed.";
  }

  if (
    normalized.includes("already settled") ||
    normalized.includes("bills were changed")
  ) {
    return "One or more bills were already settled. Refresh and try again.";
  }

  if (normalized.includes("business date")) {
    return "Choose a business date before closing the day.";
  }

  return message || "Close day could not be saved.";
}

function getBillingMonth(businessDate: string) {
  return `${businessDate.slice(0, 7)}-01`;
}

function getMonthRange(businessDate: string) {
  const [year, month] = businessDate.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 1));

  return {
    startDate: getBillingMonth(businessDate),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function getOpenCustomerCredits(
  barId: string,
  businessDate: string,
) {
  if (!barId || !businessDate) {
    return { credits: [] as OpenCustomerCredit[], error: "" };
  }

  const { startDate, endDate } = getMonthRange(businessDate);
  const { data, error } = await supabase
    .from("customer_credits")
    .select("id, business_date, customer_name, staff_name, staff_id, amount, notes")
    .eq("bar_id", barId)
    .eq("status", "unpaid")
    .gte("business_date", startDate)
    .lt("business_date", endDate)
    .order("business_date", { ascending: true })
    .returns<OpenCustomerCreditRow[]>();

  if (error) {
    return { credits: [] as OpenCustomerCredit[], error: error.message };
  }

  return {
    credits: (data ?? []).map((credit) => ({
      id: credit.id,
      businessDate: credit.business_date ?? "",
      customerName: credit.customer_name ?? "Unknown customer",
      staffName: credit.staff_name ?? "Unknown staff",
      staffId: credit.staff_id ?? "",
      amount: toNumber(credit.amount),
      notes: credit.notes ?? "",
    })),
    error: "",
  };
}

async function uploadLedgerPhoto(
  barId: string,
  businessDate: string,
  file: File | null | undefined,
) {
  if (!file) {
    return { path: "", error: "" };
  }

  const extension = file.name.split(".").pop() || "jpg";
  const filePath = `${barId}/${businessDate}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("ledger-proofs")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  return {
    path: filePath,
    error: error?.message ?? "",
  };
}

async function cleanupLedgerPhoto(path: string) {
  if (!path) {
    return { cleaned: true, error: "" };
  }

  const { error } = await supabase.storage.from("ledger-proofs").remove([path]);

  if (error) {
    console.warn("Ledger photo upload became orphaned after close-day failure.", {
      path,
      error: error.message,
    });

    return {
      cleaned: false,
      error: error.message,
    };
  }

  return {
    cleaned: true,
    error: "",
  };
}

export async function closeBusinessDay({
  barId,
  businessDate,
  cashSales,
  mpesaSales,
  notes,
  credits,
  settledBills = [],
  expenses,
  ledgerPhoto,
  role,
}: CloseBusinessDayInput) {
  if (role !== undefined && !hasPermission(role, "close_day")) {
    return { error: "You do not have permission to close a business day." };
  }

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!businessDate) {
    return { error: "Choose a business date before closing the day." };
  }

  const { path: ledgerPhotoPath, error: uploadError } = await uploadLedgerPhoto(
    barId,
    businessDate,
    ledgerPhoto,
  );

  if (uploadError) {
    return { error: uploadError };
  }

  const { error } = await supabase.rpc("close_business_day", {
    p_bar_id: barId,
    p_business_date: businessDate,
    p_cash_sales: cashSales,
    p_mpesa_sales: mpesaSales,
    p_notes: notes,
    p_ledger_photo_path: ledgerPhotoPath || null,
    p_credits: credits.filter(
      (credit) =>
        credit.staffName.trim() &&
        credit.customerName.trim() &&
        credit.amount > 0,
    ),
    p_settled_bills: settledBills,
    p_expenses: expenses.filter(
      (expense) => expense.expenseType.trim() && expense.amount > 0,
    ),
  });

  if (error) {
    const friendlyError = mapCloseDayError(error.message);
    const cleanup = await cleanupLedgerPhoto(ledgerPhotoPath);

    if (!cleanup.cleaned) {
      return {
        error: `${friendlyError} The ledger photo was uploaded but could not be removed automatically. Orphan path: ${ledgerPhotoPath}`,
      };
    }

    return { error: friendlyError };
  }

  return { error: "" };
}
