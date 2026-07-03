"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Pencil,
  LayoutGrid,
  PackagePlus,
  Save,
  Table2,
  Trash2,
} from "lucide-react";
import AccessDenied from "@/components/auth/AccessDenied";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { canDelete, canEdit, hasPermission } from "@/lib/permissions";
import { getBarContextForUser } from "@/services/dashboardService";
import {
  createProduct,
  deleteProduct,
  getProducts,
  type ManagedProduct,
  type ProductForm,
  updateProduct,
} from "@/services/productsService";

const emptyProduct: ProductForm = {
  name: "",
  category: "",
  unit: "",
  purchasePrice: 0,
  sellingPrice: 0,
  minimumStockLevel: 0,
  isActive: true,
  barcode: "",
  brand: "",
  openingStock: 0,
  currentStock: 0,
  quantity: 0,
  reorderLevel: 0,
  inventoryPurchasePrice: 0,
  inventorySellingPrice: 0,
  lastCountedAt: "",
  updatedAt: "",
};

type ProductViewMode = "table" | "cards";
const defaultColumnWidths = [
  210, 130, 90, 120, 120, 120, 120, 120, 110, 120, 120, 140, 150, 110, 120,
];

export default function ProductsPage() {
  const { loading, user } = useAuth();
  const [barId, setBarId] = useState("");
  const [barName, setBarName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [newProduct, setNewProduct] = useState<ProductForm>(emptyProduct);
  const [viewMode, setViewMode] = useState<ProductViewMode>("table");
  const [editingProductId, setEditingProductId] = useState("");
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canManageProducts = canEdit(role);
  const canRemoveProducts = canDelete(role);

  async function loadProducts(nextBarId: string) {
    const { products: nextProducts, error: productsError } =
      await getProducts(nextBarId);

    if (productsError) {
      setError(productsError);
      return;
    }

    setProducts(nextProducts);
  }

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const loadPage = async () => {
      const { barContext, error: contextError } = await getBarContextForUser(
        user.id,
        user.email,
      );

      if (!barContext) {
        setError(contextError);
        setDataLoading(false);
        return;
      }

      setBarId(barContext.barId);
      setBarName(barContext.barName);
      setRole(barContext.role);
      await loadProducts(barContext.barId);
      setDataLoading(false);
    };

    loadPage();
  }, [loading, user]);

  function updateLocalProduct(productId: string, changes: Partial<ProductForm>) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, ...changes } : product,
      ),
    );
  }

  async function handleCreate() {
    if (!canManageProducts) {
      setError("Only owners and super users can create product master records.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    const { error: createError } = await createProduct(barId, newProduct, role);

    if (createError) {
      setError(createError);
      setCreating(false);
      return;
    }

    setNewProduct(emptyProduct);
    setMessage("Product added.");
    await loadProducts(barId);
    setCreating(false);
  }

  async function handleSave(product: ManagedProduct) {
    if (!canManageProducts) {
      setError("Managers can add operational figures, but cannot edit product master records.");
      return;
    }

    setSavingId(product.id);
    setError("");
    setMessage("");

    const { error: saveError } = await updateProduct(
      barId,
      product.id,
      product.inventoryId,
      product,
      role,
    );

    if (saveError) {
      setError(saveError);
      setSavingId("");
      return;
    }

    setMessage("Product saved.");
    await loadProducts(barId);
    setEditingProductId("");
    setSavingId("");
  }

  async function handleDelete(productId: string) {
    if (!canRemoveProducts) {
      setError("Managers cannot delete product master records.");
      return;
    }

    setSavingId(productId);
    setError("");
    setMessage("");

    const { error: deleteError } = await deleteProduct(barId, productId, role);

    if (deleteError) {
      setError(deleteError);
      setSavingId("");
      return;
    }

    setProducts((current) => current.filter((product) => product.id !== productId));
    setMessage("Product removed.");
    setSavingId("");
  }

  if (loading || dataLoading) {
    return <p className="p-6">Loading products...</p>;
  }

  if (!hasPermission(role, "view_products")) {
    return (
      <AppShell>
        <AccessDenied message="Your permissions are not configured for Products yet." />
      </AppShell>
    );
  }

  function startColumnResize(columnIndex: number, startX: number) {
    const startWidth = columnWidths[columnIndex];

    function handleMouseMove(event: MouseEvent) {
      const nextWidth = Math.max(88, startWidth + event.clientX - startX);
      setColumnWidths((current) =>
        current.map((width, index) =>
          index === columnIndex ? nextWidth : width,
        ),
      );
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Products
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">{barName}</p>
          </div>
        </header>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        {canManageProducts ? (
        <section className="rounded-2xl border border-input-200 bg-background p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold">Add Product</h2>
          <ProductFields
            product={newProduct}
            onChange={(changes) =>
              setNewProduct((current) => ({ ...current, ...changes }))
            }
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !barId}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-white hover:bg-slate-700 disabled:opacity-60 sm:w-auto sm:py-2"
          >
            <PackagePlus size={18} />
            {creating ? "Adding..." : "Add Product"}
          </button>
        </section>
        ) : (
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-800 shadow-sm sm:p-5">
            Managers can view the product catalogue and add operational figures
            through inventory workflows, but product master edits are restricted
            to owners and super users.
          </section>
        )}

        <section className="rounded-2xl border border-input-200 bg-background p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Catalogue</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {products.length} products
              </span>
            </div>

            <div className="grid grid-cols-2 rounded-lg border bg-background p-1">
              <ViewModeButton
                active={viewMode === "table"}
                icon={<Table2 size={16} />}
                label="Table"
                onClick={() => setViewMode("table")}
              />
              <ViewModeButton
                active={viewMode === "cards"}
                icon={<LayoutGrid size={16} />}
                label="Cards"
                onClick={() => setViewMode("cards")}
              />
            </div>
          </div>

          {products.length === 0 ? (
            <p className="text-sm text-slate-500">No products added yet.</p>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left text-sm">
                <colgroup>
                  {columnWidths.map((width, index) => (
                    <col key={index} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="text-xs uppercase text-slate-500">
                    {[
                      "Product",
                      "Category",
                      "Unit",
                      "Purchase",
                      "Selling",
                      "Minimum",
                      "Active",
                      "Opening Stock",
                      "Current Stock",
                      "Quantity",
                      "Reorder",
                      "Inv Purchase",
                      "Inv Selling",
                      "Last Counted",
                      "Actions",
                    ].map((heading, index) => (
                      <TableHead
                        key={heading}
                        className={`${index === 0 ? "rounded-l-xl" : ""} ${
                          index === 14 ? "rounded-r-xl text-right" : ""
                        }`}
                        onResizeStart={(event) =>
                          startColumnResize(index, event.clientX)
                        }
                      >
                        {heading}
                      </TableHead>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isEditing =
                      canManageProducts && editingProductId === product.id;

                    return (
                      <tr key={product.id} className="align-middle">
                        <ProductTableCell className="font-medium">
                          <input
                            value={product.name}
                            readOnly={!isEditing}
                            onChange={(event) =>
                              updateLocalProduct(product.id, {
                                name: event.target.value,
                              })
                            }
                            className={tableInputClass(isEditing)}
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <input
                            value={product.category}
                            readOnly={!isEditing}
                            onChange={(event) =>
                              updateLocalProduct(product.id, {
                                category: event.target.value,
                              })
                            }
                            className={tableInputClass(isEditing)}
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <input
                            value={product.unit}
                            readOnly={!isEditing}
                            onChange={(event) =>
                              updateLocalProduct(product.id, {
                                unit: event.target.value,
                              })
                            }
                            className={tableInputClass(isEditing)}
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.purchasePrice}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                purchasePrice: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.sellingPrice}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                sellingPrice: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.minimumStockLevel}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                minimumStockLevel: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                            <input
                              type="checkbox"
                              checked={product.isActive}
                              disabled={!isEditing}
                              onChange={(event) =>
                                updateLocalProduct(product.id, {
                                  isActive: event.target.checked,
                                })
                              }
                              className="h-4 w-4 disabled:opacity-50"
                            />
                            <span className="text-xs text-slate-600">
                              {product.isActive ? "Yes" : "No"}
                            </span>
                          </label>
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.openingStock}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                openingStock: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.currentStock}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                currentStock: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.quantity}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                quantity: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.reorderLevel}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                reorderLevel: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.inventoryPurchasePrice}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                inventoryPurchasePrice: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <InlineNumberInput
                            readOnly={!isEditing}
                            value={product.inventorySellingPrice}
                            onChange={(value) =>
                              updateLocalProduct(product.id, {
                                inventorySellingPrice: value,
                              })
                            }
                          />
                        </ProductTableCell>
                        <ProductTableCell>
                          <input
                            type="date"
                            value={product.lastCountedAt}
                            readOnly={!isEditing}
                            onChange={(event) =>
                              updateLocalProduct(product.id, {
                                lastCountedAt: event.target.value,
                              })
                            }
                            className={tableInputClass(isEditing)}
                          />
                        </ProductTableCell>
                        <ProductTableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canManageProducts && isEditing ? (
                              <button
                                type="button"
                                onClick={() => handleSave(product)}
                                disabled={savingId === product.id}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60"
                                aria-label={`Save ${product.name}`}
                                title="Save"
                              >
                                <Check size={16} />
                              </button>
                            ) : canManageProducts ? (
                              <button
                                type="button"
                                onClick={() => setEditingProductId(product.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-700 hover:bg-slate-50"
                                aria-label={`Edit ${product.name}`}
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </button>
                            ) : null}
                            {canRemoveProducts && (
                            <button
                              type="button"
                              onClick={() => handleDelete(product.id)}
                              disabled={savingId === product.id}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              aria-label={`Remove ${product.name}`}
                              title="Remove"
                            >
                              <Trash2 size={16} />
                            </button>
                            )}
                            {!canManageProducts && !canRemoveProducts && (
                              <span className="text-xs font-semibold text-slate-400">
                                Read only
                              </span>
                            )}
                          </div>
                        </ProductTableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((product) => (
                <div key={product.id} className="rounded-xl border p-3 sm:p-4">
                  <ProductFields
                    product={product}
                    readOnly={!canManageProducts}
                    onChange={(changes) =>
                      updateLocalProduct(product.id, changes as Partial<ProductForm>)
                    }
                  />
                  {(canManageProducts || canRemoveProducts) && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {canManageProducts && (
                    <button
                      type="button"
                      onClick={() => handleSave(product)}
                      disabled={savingId === product.id}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                      <Save size={16} />
                      {savingId === product.id ? "Saving..." : "Save"}
                    </button>
                    )}
                    {canRemoveProducts && (
                    <button
                      type="button"
                      onClick={() => handleDelete(product.id)}
                      disabled={savingId === product.id}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TableHead({
  children,
  className = "",
  onResizeStart,
}: {
  children: ReactNode;
  className?: string;
  onResizeStart?: (event: React.MouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <th className={`relative bg-slate-50 px-3 py-3 font-semibold ${className}`}>
      {children}
      {onResizeStart && (
        <span
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          className="absolute right-0 top-2 h-7 w-1 cursor-col-resize rounded-full bg-slate-200 hover:bg-slate-400"
        />
      )}
    </th>
  );
}

function ProductTableCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`border-b border-slate-100 px-3 py-3 ${className}`}>
      {children}
    </td>
  );
}

function InlineNumberInput({
  value,
  readOnly = false,
  onChange,
}: {
  value: number;
  readOnly?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min="0"
      readOnly={readOnly}
      value={value || ""}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className={tableInputClass(!readOnly)}
      placeholder="0"
    />
  );
}

function tableInputClass(isEditing: boolean) {
  return isEditing
    ? "input py-2"
    : "w-full rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm text-slate-800";
}

function ProductFields({
  product,
  readOnly = false,
  onChange,
}: {
  product: ProductForm;
  readOnly?: boolean;
  onChange: (product: Partial<ProductForm>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
      <label className="md:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Product
        </span>
        <input
          value={product.name}
          readOnly={readOnly}
          onChange={(event) => onChange({ name: event.target.value })}
          className={readOnly ? tableInputClass(false) : "input"}
          placeholder="Tusker Lager"
        />
      </label>

      <TextField
        label="Category"
        value={product.category}
        readOnly={readOnly}
        onChange={(value) => onChange({ category: value })}
      />
      <TextField
        label="Unit"
        value={product.unit}
        readOnly={readOnly}
        onChange={(value) => onChange({ unit: value })}
      />
      <TextField
        label="Brand"
        value={product.brand}
        readOnly={readOnly}
        onChange={(value) => onChange({ brand: value })}
      />
      <TextField
        label="Barcode"
        value={product.barcode}
        readOnly={readOnly}
        onChange={(value) => onChange({ barcode: value })}
      />
      <NumberField
        label="Purchase Price"
        value={product.purchasePrice}
        readOnly={readOnly}
        onChange={(value) => onChange({ purchasePrice: value })}
      />
      <NumberField
        label="Selling"
        value={product.sellingPrice}
        readOnly={readOnly}
        onChange={(value) => onChange({ sellingPrice: value })}
      />
      <NumberField
        label="Opening Stock"
        value={product.openingStock}
        readOnly={readOnly}
        onChange={(value) => onChange({ openingStock: value })}
      />
      <NumberField
        label="Current Stock"
        value={product.currentStock}
        readOnly={readOnly}
        onChange={(value) => onChange({ currentStock: value })}
      />
      <NumberField
        label="Quantity"
        value={product.quantity}
        readOnly={readOnly}
        onChange={(value) => onChange({ quantity: value })}
      />
      <NumberField
        label="Reorder Level"
        value={product.reorderLevel}
        readOnly={readOnly}
        onChange={(value) => onChange({ reorderLevel: value })}
      />
      <NumberField
        label="Inventory Purchase"
        value={product.inventoryPurchasePrice}
        readOnly={readOnly}
        onChange={(value) => onChange({ inventoryPurchasePrice: value })}
      />
      <NumberField
        label="Inventory Selling"
        value={product.inventorySellingPrice}
        readOnly={readOnly}
        onChange={(value) => onChange({ inventorySellingPrice: value })}
      />
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Last Counted
        </span>
        <input
          type="date"
          value={product.lastCountedAt}
          readOnly={readOnly}
          onChange={(event) => onChange({ lastCountedAt: event.target.value })}
          className={readOnly ? tableInputClass(false) : "input"}
        />
      </label>
      <NumberField
        label="Minimum Stock"
        value={product.minimumStockLevel}
        readOnly={readOnly}
        onChange={(value) => onChange({ minimumStockLevel: value })}
      />
      <label className="flex items-center gap-2 rounded-lg border px-3 py-3 md:mt-5">
        <input
          type="checkbox"
          checked={product.isActive}
          disabled={readOnly}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          className="h-4 w-4 disabled:opacity-50"
        />
        <span className="text-sm text-slate-700">Active</span>
      </label>
    </div>
  );
}

function TextField({
  label,
  value,
  readOnly = false,
  onChange,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={readOnly ? tableInputClass(false) : "input"}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  readOnly = false,
  onChange,
}: {
  label: string;
  value: number;
  readOnly?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min="0"
        value={value || ""}
        readOnly={readOnly}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={readOnly ? tableInputClass(false) : "input"}
        placeholder="0"
      />
    </label>
  );
}
