"use client";

import { supabase } from "@/lib/supabaseClient";
import { isSuperUser } from "@/lib/permissions";

export type CloseDaySettings = {
  showTopProduct: boolean;
  showBills: boolean;
  showDailyExpenses: boolean;
  showLedgerPhoto: boolean;
  expenseOptions: string[];
};

type CloseDaySettingsRow = {
  show_top_product: boolean | null;
  show_bills: boolean | null;
  show_daily_expenses: boolean | null;
  show_ledger_photo: boolean | null;
  expense_options: string[] | null;
};

export const defaultCloseDaySettings: CloseDaySettings = {
  showTopProduct: false,
  showBills: true,
  showDailyExpenses: true,
  showLedgerPhoto: true,
  expenseOptions: ["Lunch", "Transport", "Restock", "Cleaning", "Repairs"],
};

function mapSettings(row: CloseDaySettingsRow | null): CloseDaySettings {
  if (!row) {
    return defaultCloseDaySettings;
  }

  return {
    showTopProduct: row.show_top_product ?? defaultCloseDaySettings.showTopProduct,
    showBills: row.show_bills ?? defaultCloseDaySettings.showBills,
    showDailyExpenses:
      row.show_daily_expenses ?? defaultCloseDaySettings.showDailyExpenses,
    showLedgerPhoto:
      row.show_ledger_photo ?? defaultCloseDaySettings.showLedgerPhoto,
    expenseOptions:
      row.expense_options?.filter(Boolean) ??
      defaultCloseDaySettings.expenseOptions,
  };
}

export async function getCloseDaySettings(barId: string) {
  if (!barId) {
    return {
      settings: defaultCloseDaySettings,
      error: "No bar is linked to this user yet.",
    };
  }

  const { data, error } = await supabase
    .from("close_day_settings")
    .select(
      "show_top_product, show_bills, show_daily_expenses, show_ledger_photo, expense_options",
    )
    .eq("bar_id", barId)
    .maybeSingle<CloseDaySettingsRow>();

  if (error) {
    return {
      settings: defaultCloseDaySettings,
      error: error.message,
    };
  }

  return {
    settings: mapSettings(data),
    error: "",
  };
}

export async function saveCloseDaySettings(
  barId: string,
  settings: CloseDaySettings,
  role?: string | null,
) {
  if (role !== undefined && !isSuperUser(role)) {
    return { error: "Settings are only available to super users." };
  }

  if (!barId) {
    return { error: "No bar is linked to this user yet." };
  }

  const expenseOptions = Array.from(
    new Set(settings.expenseOptions.map((option) => option.trim()).filter(Boolean)),
  );

  const { error } = await supabase.from("close_day_settings").upsert(
    {
      bar_id: barId,
      show_top_product: settings.showTopProduct,
      show_bills: settings.showBills,
      show_daily_expenses: settings.showDailyExpenses,
      show_ledger_photo: settings.showLedgerPhoto,
      expense_options:
        expenseOptions.length > 0
          ? expenseOptions
          : defaultCloseDaySettings.expenseOptions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bar_id" },
  );

  return { error: error?.message ?? "" };
}
