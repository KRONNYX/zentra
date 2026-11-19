"use client";

import {
  ProductClosure,
  CustomerCredit,
  ExpenseEntry,
} from "@/types/dailyClosure";

interface Props {
  cashSales: number;
  mpesaSales: number;

  products: ProductClosure[];
  credits: CustomerCredit[];
  expenses: ExpenseEntry[];
}

export default function ClosureSummary({
  cashSales,
  mpesaSales,
  products,
  credits,
  expenses,
}: Props) {
  const totalRevenue =
    cashSales + mpesaSales;

  const totalCredits =
    credits.reduce(
      (sum, credit) =>
        sum + credit.amount,
      0,
    );

  const totalExpenses =
    expenses.reduce(
      (sum, expense) =>
        sum + expense.amount,
      0,
    );

  const totalProfit =
    products.reduce((sum, product) => {
      const sold =
        product.openingStock +
        product.purchasedStock -
        product.closingStock;

      const profitPerUnit =
        product.sellingPrice -
        product.costPrice;

      return (
        sum +
        sold * profitPerUnit
      );
    }, 0);

  const expectedCash =
    cashSales -
    totalExpenses -
    totalCredits;

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-4 text-lg font-semibold">
        Daily Summary
      </h3>

      <div className="space-y-3">

        <SummaryRow
          label="Revenue"
          value={totalRevenue}
        />

        <SummaryRow
          label="Profit"
          value={totalProfit}
        />

        <SummaryRow
          label="Credits"
          value={totalCredits}
        />

        <SummaryRow
          label="Expenses"
          value={totalExpenses}
        />

        <SummaryRow
          label="Expected Cash"
          value={expectedCash}
          highlight
        />

      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        highlight
          ? "font-bold text-indigo-600"
          : ""
      }`}
    >
      <span>{label}</span>

      <span>
        KES {value.toLocaleString()}
      </span>
    </div>
  );
}
