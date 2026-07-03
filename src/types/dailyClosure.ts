export interface ProductClosure {
  productId: string;
  productName: string;
  openingStock: number;
  purchasedStock: number;
  closingStock: number;
  unitsSold: number;
  sellingPrice: number;
  costPrice: number;
}

export interface CustomerCredit {
  customerName: string;
  amount: number;
  staffName: string;
  staffId?: string;
  notes?: string;
}

export interface ExpenseEntry {
  expenseType: string;
  description: string;
  amount: number;
}
