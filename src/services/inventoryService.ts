"use client";

import { supabase } from "@/lib/supabaseClient";
import { hasPermission } from "@/lib/permissions";

export type InventoryUpdateItem = {
  productId: string;
  inventoryId: string;
  productName: string;
  openingStock: number;
  purchasedStock: number;
  closingStock: number;
  unitsSold: number;
  sellingPrice: number;
  costPrice: number;
};

type SaveInventoryUpdateInput = {
  barId: string;
  businessDate: string;
  items: InventoryUpdateItem[];
  role?: string | null;
};

type InventoryUpdateResult = {
  productsUpdated?: number;
  movementsCreated?: number;
};

function cleanNumber(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function cleanItem(item: InventoryUpdateItem): InventoryUpdateItem {
  const openingStock = cleanNumber(item.openingStock);
  const purchasedStock = cleanNumber(item.purchasedStock);
  const closingStock = cleanNumber(item.closingStock);
  const unitsSold = Math.max(0, openingStock + purchasedStock - closingStock);

  return {
    ...item,
    openingStock,
    purchasedStock,
    closingStock,
    unitsSold,
    sellingPrice: cleanNumber(item.sellingPrice),
    costPrice: cleanNumber(item.costPrice),
  };
}

function mapInventoryError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("newer inventory count") ||
    normalized.includes("newer stock count")
  ) {
    return "A newer inventory count already exists.";
  }

  if (normalized.includes("business date")) {
    return "Choose a business date before saving inventory.";
  }

  if (normalized.includes("no inventory rows")) {
    return "No inventory rows are available to save.";
  }

  return message || "Inventory update could not be saved.";
}

export async function saveInventoryUpdate({
  barId,
  businessDate,
  items,
  role,
}: SaveInventoryUpdateInput) {
  if (role !== undefined && !hasPermission(role, "update_inventory")) {
    return { error: "You do not have permission to update inventory." };
  }

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!businessDate) {
    return { error: "Choose a business date before saving inventory." };
  }

  const cleanedItems = items
    .map(cleanItem)
    .filter((item) => item.productId && item.productName.trim());

  if (cleanedItems.length === 0) {
    return { error: "No inventory rows are available to save." };
  }

  const { data, error } = await supabase.rpc("save_inventory_update", {
    p_bar_id: barId,
    p_business_date: businessDate,
    p_items: cleanedItems,
  });

  if (error) {
    return { error: mapInventoryError(error.message) };
  }

  const result = (data ?? {}) as InventoryUpdateResult;

  return {
    error: "",
    productsUpdated: result.productsUpdated ?? cleanedItems.length,
    movementsCreated: result.movementsCreated ?? 0,
  };
}
