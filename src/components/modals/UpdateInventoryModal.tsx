"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, PackageCheck, X } from "lucide-react";
import {
  saveInventoryUpdate,
  type InventoryUpdateItem,
} from "@/services/inventoryService";
import { getProducts } from "@/services/productsService";

export default function UpdateInventoryModal({
  isOpen,
  barId,
  role,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  barId: string;
  role?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [businessDate, setBusinessDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [productClosures, setProductClosures] = useState<InventoryUpdateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !barId) {
      return;
    }

    let cancelled = false;

    const loadProducts = async () => {
      setLoading(true);
      setError("");
      setMessage("");

      const { products, error: productsError } = await getProducts(barId);

      if (cancelled) {
        return;
      }

      if (productsError) {
        setError(productsError);
        setLoading(false);
        return;
      }

      setProductClosures(
        products
          .filter((product) => product.isActive)
          .map((product) => ({
            productId: product.id,
            inventoryId: product.inventoryId,
            productName: product.name,
            openingStock: product.currentStock,
            purchasedStock: 0,
            closingStock: product.currentStock,
            unitsSold: 0,
            sellingPrice: product.sellingPrice,
            costPrice: product.purchasePrice,
          })),
      );
      setLoading(false);
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [barId, isOpen]);

  if (!isOpen) {
    return null;
  }

  function updateProductClosure(
    index: number,
    changes: Partial<InventoryUpdateItem>,
  ) {
    setProductClosures((current) =>
      current.map((product, itemIndex) => {
        if (itemIndex !== index) {
          return product;
        }

        const nextProduct = { ...product, ...changes };
        const unitsSold = Math.max(
          0,
          nextProduct.openingStock +
            nextProduct.purchasedStock -
            nextProduct.closingStock,
        );

        return {
          ...nextProduct,
          unitsSold,
        };
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    const result = await saveInventoryUpdate({
      barId,
      businessDate,
      items: productClosures,
      role,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setMessage(
      `Inventory saved. ${result.productsUpdated ?? 0} products updated and ${result.movementsCreated ?? 0} movement records created.`,
    );
    onSuccess?.();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-5xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950">
              <PackageCheck size={22} className="text-blue-600" />
              Update Inventory
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Capture stock counts from the product ledger.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close update inventory modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <label className="block max-w-xs space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarDays size={18} className="text-blue-600" />
              Inventory Date
            </span>
            <input
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
              className="input"
            />
          </label>

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Opening</th>
                    <th className="px-3 py-2">Added</th>
                    <th className="px-3 py-2">Closing</th>
                    <th className="px-3 py-2">Sale</th>
                    <th className="px-3 py-2">@</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {productClosures.map((product, index) => {
                    const amount = product.unitsSold * product.sellingPrice;
                    const cost = product.unitsSold * product.costPrice;
                    const profit = amount - cost;

                    return (
                      <tr key={product.productId} className="border-t">
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {product.productName}
                        </td>
                        <td className="px-2 py-2">
                          <LedgerNumberInput
                            value={product.openingStock}
                            onChange={(value) =>
                              updateProductClosure(index, {
                                openingStock: value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <LedgerNumberInput
                            value={product.purchasedStock}
                            onChange={(value) =>
                              updateProductClosure(index, {
                                purchasedStock: value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <LedgerNumberInput
                            value={product.closingStock}
                            onChange={(value) =>
                              updateProductClosure(index, {
                                closingStock: value,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">{product.unitsSold}</td>
                        <td className="px-3 py-2">{product.sellingPrice || "-"}</td>
                        <td className="px-3 py-2">{amount || "-"}</td>
                        <td className="px-3 py-2">{product.costPrice || "-"}</td>
                        <td className="px-3 py-2">{profit || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && productClosures.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No active products found. Add products before updating inventory.
            </p>
          )}

          {message && (
            <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {message}
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end">
          <Link
            href="/products"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Open Products
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || productClosures.length === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LedgerNumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min="0"
      value={value || ""}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      placeholder="0"
    />
  );
}
