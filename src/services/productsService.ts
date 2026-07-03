"use client";

import { supabase } from "@/lib/supabaseClient";
import { canDelete, canEdit } from "@/lib/permissions";
import { getCurrentUser } from "@/services/authService";

export type ProductForm = {
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minimumStockLevel: number;
  isActive: boolean;
  barcode: string;
  brand: string;
  openingStock: number;
  currentStock: number;
  quantity: number;
  reorderLevel: number;
  inventoryPurchasePrice: number;
  inventorySellingPrice: number;
  lastCountedAt: string;
  updatedAt: string;
};

export type ManagedProduct = ProductForm & {
  id: string;
  inventoryId: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  purchase_price: number | string | null;
  selling_price: number | string | null;
  minimum_stock_level: number | string | null;
  is_active: boolean | null;
  barcode: string | null;
  brand: string | null;
};

type InventoryRow = {
  id: string;
  product_id: string | null;
  name: string | null;
  opening_stock: number | string | null;
  current_stock: number | string | null;
  quantity: number | string | null;
  reorder_level: number | string | null;
  purchase_price: number | string | null;
  selling_price: number | string | null;
  last_counted_at: string | null;
  updated_at: string | null;
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

function cleanProduct(input: ProductForm) {
  return {
    name: input.name.trim(),
    category: input.category.trim(),
    unit: input.unit.trim(),
    purchasePrice: Math.max(0, input.purchasePrice || 0),
    sellingPrice: Math.max(0, input.sellingPrice || 0),
    minimumStockLevel: Math.max(0, input.minimumStockLevel || 0),
    isActive: input.isActive,
    barcode: input.barcode.trim(),
    brand: input.brand.trim(),
    openingStock: Math.max(0, input.openingStock || 0),
    currentStock: Math.max(0, input.currentStock || 0),
    quantity: Math.max(0, input.quantity || 0),
    reorderLevel: Math.max(0, input.reorderLevel || 0),
    inventoryPurchasePrice: Math.max(0, input.inventoryPurchasePrice || 0),
    inventorySellingPrice: Math.max(0, input.inventorySellingPrice || 0),
    lastCountedAt: input.lastCountedAt,
  };
}

function normalizeName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

async function writeProductAudit(
  barId: string,
  action: string,
  values: Record<string, unknown>,
) {
  const { user } = await getCurrentUser();

  if (!user) {
    return;
  }

  await supabase.from("audit_logs").insert({
    bar_id: barId,
    user_id: null,
    action,
    entity_type: "product",
    new_values: {
      actorUserId: user.id,
      ...values,
    },
  });
}

export async function getProducts(barId: string) {
  if (!barId) {
    return { products: [] as ManagedProduct[], error: "No bar selected." };
  }

  const [productsResult, inventoryResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, category, unit, purchase_price, selling_price, minimum_stock_level, is_active, barcode, brand",
      )
      .eq("bar_id", barId)
      .order("name", { ascending: true })
      .returns<ProductRow[]>(),
    supabase
      .from("inventory")
      .select(
        "id, product_id, name, opening_stock, current_stock, quantity, reorder_level, purchase_price, selling_price, last_counted_at, updated_at",
      )
      .eq("bar_id", barId)
      .returns<InventoryRow[]>(),
  ]);

  const error = productsResult.error ?? inventoryResult.error;

  if (error) {
    return { products: [] as ManagedProduct[], error: error.message };
  }

  const inventoryByProduct = new Map(
    (inventoryResult.data ?? [])
      .filter((item) => item.product_id)
      .map((item) => [item.product_id as string, item]),
  );
  const inventoryByName = new Map(
    (inventoryResult.data ?? [])
      .filter((item) => normalizeName(item.name))
      .map((item) => [normalizeName(item.name), item]),
  );

  return {
    products: (productsResult.data ?? []).map((product) => {
      const inventory =
        inventoryByProduct.get(product.id) ??
        inventoryByName.get(normalizeName(product.name));
      const currentStock =
        toNumber(inventory?.current_stock) || toNumber(inventory?.quantity);
      const purchasePrice = toNumber(product.purchase_price);
      const sellingPrice = toNumber(product.selling_price);

      return {
        id: product.id,
        inventoryId: inventory?.id ?? "",
        name: product.name ?? "Unnamed product",
        category: product.category ?? "",
        unit: product.unit ?? "",
        purchasePrice,
        sellingPrice,
        openingStock: toNumber(inventory?.opening_stock) || currentStock,
        minimumStockLevel: toNumber(product.minimum_stock_level),
        currentStock,
        quantity: toNumber(inventory?.quantity) || currentStock,
        reorderLevel:
          toNumber(inventory?.reorder_level) ||
          toNumber(product.minimum_stock_level),
        inventoryPurchasePrice: toNumber(inventory?.purchase_price) || purchasePrice,
        inventorySellingPrice: toNumber(inventory?.selling_price) || sellingPrice,
        isActive: product.is_active ?? true,
        barcode: product.barcode ?? "",
        brand: product.brand ?? "",
        lastCountedAt: inventory?.last_counted_at
          ? inventory.last_counted_at.slice(0, 10)
          : "",
        updatedAt: inventory?.updated_at ?? "",
      };
    }),
    error: "",
  };
}

export async function createProduct(
  barId: string,
  input: ProductForm,
  role?: string | null,
) {
  const product = cleanProduct(input);

  if (role !== undefined && !canEdit(role)) {
    return { error: "Only owners and super users can create product master records." };
  }

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!product.name) {
    return { error: "Product name is required." };
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      bar_id: barId,
      name: product.name,
      category: product.category || null,
      unit: product.unit || null,
      purchase_price: product.purchasePrice,
      selling_price: product.sellingPrice,
      minimum_stock_level: product.minimumStockLevel,
      is_active: product.isActive,
      barcode: product.barcode || null,
      brand: product.brand || null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { error: error?.message ?? "Product was not created." };
  }

  const { error: inventoryError } = await supabase.from("inventory").insert({
    bar_id: barId,
    product_id: data.id,
    name: product.name,
    opening_stock: product.openingStock,
    current_stock: product.currentStock,
    quantity: product.quantity || product.currentStock,
    reorder_level: product.reorderLevel || product.minimumStockLevel,
    purchase_price: product.inventoryPurchasePrice || product.purchasePrice,
    selling_price: product.inventorySellingPrice || product.sellingPrice,
    last_counted_at: product.lastCountedAt || null,
    updated_at: new Date().toISOString(),
  });

  if (!inventoryError) {
    await writeProductAudit(barId, "product_create", {
      productId: data.id,
      name: product.name,
      openingStock: product.openingStock,
      currentStock: product.currentStock,
    });
  }

  return { error: inventoryError?.message ?? "" };
}

export async function updateProduct(
  barId: string,
  productId: string,
  inventoryId: string,
  input: ProductForm,
  role?: string | null,
) {
  const product = cleanProduct(input);

  if (role !== undefined && !canEdit(role)) {
    return { error: "Managers can add operational figures, but cannot edit product master records." };
  }

  if (!barId || !productId) {
    return { error: "Product could not be found." };
  }

  if (!product.name) {
    return { error: "Product name is required." };
  }

  const { error: productError } = await supabase
    .from("products")
    .update({
      name: product.name,
      category: product.category || null,
      unit: product.unit || null,
      purchase_price: product.purchasePrice,
      selling_price: product.sellingPrice,
      minimum_stock_level: product.minimumStockLevel,
      is_active: product.isActive,
      barcode: product.barcode || null,
      brand: product.brand || null,
    })
    .eq("bar_id", barId)
    .eq("id", productId);

  if (productError) {
    return { error: productError.message };
  }

  const inventoryPayload = {
    bar_id: barId,
    product_id: productId,
    name: product.name,
    opening_stock: product.openingStock,
    current_stock: product.currentStock,
    quantity: product.quantity || product.currentStock,
    reorder_level: product.reorderLevel || product.minimumStockLevel,
    purchase_price: product.inventoryPurchasePrice || product.purchasePrice,
    selling_price: product.inventorySellingPrice || product.sellingPrice,
    last_counted_at: product.lastCountedAt || null,
    updated_at: new Date().toISOString(),
  };

  const { error: inventoryError } = inventoryId
    ? await supabase
        .from("inventory")
        .update(inventoryPayload)
        .eq("bar_id", barId)
        .eq("id", inventoryId)
    : await supabase.from("inventory").insert(inventoryPayload);

  if (!inventoryError) {
    await writeProductAudit(barId, "product_update", {
      productId,
      inventoryId,
      name: product.name,
      currentStock: product.currentStock,
      sellingPrice: product.sellingPrice,
      purchasePrice: product.purchasePrice,
    });
  }

  return { error: inventoryError?.message ?? "" };
}

export async function deleteProduct(
  barId: string,
  productId: string,
  role?: string | null,
) {
  if (role !== undefined && !canDelete(role)) {
    return { error: "Managers cannot delete product master records." };
  }

  if (!barId || !productId) {
    return { error: "Product could not be found." };
  }

  const { error: inventoryError } = await supabase
    .from("inventory")
    .delete()
    .eq("bar_id", barId)
    .eq("product_id", productId);

  if (inventoryError) {
    return { error: inventoryError.message };
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("bar_id", barId)
    .eq("id", productId);

  if (!error) {
    await writeProductAudit(barId, "product_delete", {
      productId,
    });
  }

  return { error: error?.message ?? "" };
}
