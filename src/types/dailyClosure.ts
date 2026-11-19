export interface BlindProductCountRow {
  product_id: string;
  name: string;
  category: string;
  unit: string;
  actual_closing_stock: number | '';
}

export interface CloseBusinessDayInput {
  barId: string;
  businessDate: string; // YYYY-MM-DD
  openingCash: number;
  actualCash: number;
  actualMpesa: number;
  blindCounts: {
    product_id: string;
    actual_closing_stock: number;
  }[];
  notes?: string;
}

export interface DailyClosureItemDetail {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  opening_stock: number;
  purchased_stock: number;
  wastage_stock: number;
  quantity_sold: number;
  expected_closing_stock: number;
  closing_stock: number;
  variance_stock: number;
  selling_price: number;
  revenue_generated: number;
  profit_generated: number;
}

export interface DailyClosureReport {
  id: string;
  bar_id: string;
  business_date: string;
  status: 'open' | 'closed' | string;
  opening_cash: number;
  cash_sales: number;
  mpesa_sales: number;
  expected_cash: number;
  actual_cash: number;
  expected_mpesa: number;
  actual_mpesa: number;
  total_expenses_cash: number;
  stock_variance_value: number;
  profit_total: number;
  units_sold: number;
  notes: string | null;
  closed_at: string | null;
  items: DailyClosureItemDetail[];
}