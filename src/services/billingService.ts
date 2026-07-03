"use client";

import { supabase } from "@/lib/supabaseClient";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/services/authService";

export type PaymentMethod = "cash" | "mpesa";

export type UnpaidBill = {
  id: string;
  businessDate: string;
  customerName: string;
  staffName: string;
  staffId: string;
  amount: number;
  notes: string;
  status: "unpaid" | "settled";
};

export type BillSettlement = {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
};

export type BillSettlementValidation = {
  validSettlements: BillSettlement[];
  cashTotal: number;
  mpesaTotal: number;
  skippedCount: number;
};

type CustomerCreditRow = {
  id: string;
  business_date: string | null;
  customer_name: string | null;
  staff_name: string | null;
  staff_id: string | null;
  amount: number | string | null;
  notes: string | null;
  status: "unpaid" | "settled" | null;
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

function getMonthRange(anchorDate?: string) {
  const start = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function mapBill(row: CustomerCreditRow): UnpaidBill {
  return {
    id: row.id,
    businessDate: row.business_date ?? "",
    customerName: row.customer_name ?? "Unknown customer",
    staffName: row.staff_name ?? "Unknown staff",
    staffId: row.staff_id ?? "",
    amount: toNumber(row.amount),
    notes: row.notes ?? "",
    status: row.status ?? "unpaid",
  };
}

function settlementTotals(settlements: BillSettlement[]) {
  return {
    cashTotal: settlements
      .filter((settlement) => settlement.paymentMethod === "cash")
      .reduce((total, settlement) => total + settlement.amount, 0),
    mpesaTotal: settlements
      .filter((settlement) => settlement.paymentMethod === "mpesa")
      .reduce((total, settlement) => total + settlement.amount, 0),
  };
}

export async function getUnpaidBillsForBar(
  barId: string,
  anchorDate?: string,
) {
  if (!barId) {
    return { bills: [] as UnpaidBill[], error: "No bar selected." };
  }

  const { startDate, endDate } = getMonthRange(anchorDate);
  const { data, error } = await supabase
    .from("customer_credits")
    .select("id, business_date, customer_name, staff_name, staff_id, amount, notes, status")
    .eq("bar_id", barId)
    .eq("status", "unpaid")
    .gte("business_date", startDate)
    .lt("business_date", endDate)
    .order("business_date", { ascending: true })
    .returns<CustomerCreditRow[]>();

  if (error) {
    return { bills: [] as UnpaidBill[], error: error.message };
  }

  return {
    bills: (data ?? []).map(mapBill),
    error: "",
  };
}

export async function settleBills({
  barId,
  settledDate,
  settlements,
  role,
}: {
  barId: string;
  settledDate: string;
  settlements: BillSettlement[];
  role?: string | null;
}) {
  if (role !== undefined && !hasPermission(role, "close_day")) {
    return { error: "You do not have permission to settle bills." };
  }

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!settledDate) {
    return { error: "Choose a business date before settling bills." };
  }

  if (settlements.length === 0) {
    return { error: "", settledCount: 0 };
  }

  const { user } = await getCurrentUser();

  if (!user) {
    return { error: "User not authenticated." };
  }

  let settledCount = 0;

  for (const settlement of settlements) {
    const { data, error } = await supabase
      .from("customer_credits")
      .update({
        status: "settled",
        settled_at: new Date().toISOString(),
        settled_business_date: settledDate,
        settled_by: user.id,
      })
      .eq("bar_id", barId)
      .eq("id", settlement.id)
      .eq("status", "unpaid")
      .select("id")
      .returns<{ id: string }[]>();

    if (error) {
      return { error: error.message };
    }

    settledCount += data?.length ?? 0;
  }

  if (settledCount !== settlements.length) {
    return {
      error:
        "Some selected bills were already settled or could not be found. Refresh and try again.",
      settledCount,
    };
  }

  const totals = settlementTotals(settlements);
  await supabase.from("audit_logs").insert({
    bar_id: barId,
    user_id: null,
    action: "bill_settlement",
    entity_type: "customer_credits",
    new_values: {
      actorUserId: user.id,
      settledDate,
      settlements,
      cashTotal: totals.cashTotal,
      mpesaTotal: totals.mpesaTotal,
    },
  });

  return { error: "", settledCount };
}

export async function validateBillSettlements(
  barId: string,
  settlements: BillSettlement[],
): Promise<{ validation: BillSettlementValidation; error: string }> {
  if (settlements.length === 0) {
    return {
      validation: {
        validSettlements: [],
        cashTotal: 0,
        mpesaTotal: 0,
        skippedCount: 0,
      },
      error: "",
    };
  }

  const ids = settlements.map((settlement) => settlement.id);
  const { data, error } = await supabase
    .from("customer_credits")
    .select("id, amount, status")
    .eq("bar_id", barId)
    .in("id", ids)
    .returns<Pick<CustomerCreditRow, "id" | "amount" | "status">[]>();

  if (error) {
    return {
      validation: {
        validSettlements: [],
        cashTotal: 0,
        mpesaTotal: 0,
        skippedCount: settlements.length,
      },
      error: error.message,
    };
  }

  const unpaidById = new Map(
    (data ?? [])
      .filter((row) => row.status === "unpaid")
      .map((row) => [row.id, toNumber(row.amount)]),
  );
  const validSettlements = settlements.filter((settlement) => {
    const unpaidAmount = unpaidById.get(settlement.id);
    return typeof unpaidAmount === "number" && unpaidAmount === settlement.amount;
  });
  const totals = settlementTotals(validSettlements);

  return {
    validation: {
      validSettlements,
      cashTotal: totals.cashTotal,
      mpesaTotal: totals.mpesaTotal,
      skippedCount: settlements.length - validSettlements.length,
    },
    error: "",
  };
}
