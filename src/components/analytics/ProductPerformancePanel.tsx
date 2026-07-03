import { PackageSearch } from "lucide-react";
import type { ProductSale } from "@/services/dashboardService";

export default function ProductPerformancePanel({
  products,
}: {
  products: ProductSale[];
}) {
  const maxUnits = Math.max(...products.map((product) => product.unitsSold), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-950">Product Performance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Fastest moving products from ledger closures.
          </p>
        </div>
        <PackageSearch size={20} className="text-slate-400" />
      </div>

      <div className="space-y-3">
        {products.length > 0 ? (
          products.map((product, index) => (
            <div key={product.productName} className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {index + 1}. {product.productName}
                  </p>
                  <p className="text-xs text-slate-500">Units sold</p>
                </div>
                <p className="text-lg font-black text-slate-950">
                  {product.unitsSold}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${(product.unitsSold / maxUnits) * 100}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Product performance appears after ledger counts are submitted.
          </p>
        )}
      </div>
    </section>
  );
}
