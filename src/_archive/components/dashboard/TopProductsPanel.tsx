import { Package } from "lucide-react";
import type { ProductSale } from "@/services/dashboardService";

export default function TopProductsPanel({
  products,
}: {
  products: ProductSale[];
}) {
  const maxUnits = Math.max(...products.map((product) => product.unitsSold), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">Top Products</h2>
          <p className="text-sm text-slate-500">What is driving sales</p>
        </div>
        <Package size={20} className="text-slate-400" />
      </div>

      <div className="space-y-3">
        {products.length > 0 ? (
          products.map((product, index) => (
            <div key={product.productName} className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {index + 1}. {product.productName}
                  </p>
                  <p className="text-xs text-slate-500">{product.unitsSold} units sold</p>
                </div>
                <p className="text-lg font-black text-slate-950">{product.unitsSold}</p>
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
            No product ranking yet. Record product counts during Close Day.
          </p>
        )}
      </div>
    </section>
  );
}
