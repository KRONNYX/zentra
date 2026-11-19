import { supabase } from '@/lib/supabaseClient';
import {
  BlindProductCountRow,
  CloseBusinessDayInput,
  DailyClosureReport,
} from '@/types/dailyClosure';

type NumericValue = number | string | null;

interface ClosureItemRow {
  id: string;
  product_id: string;
  opening_stock: NumericValue;
  purchased_stock: NumericValue;
  wastage_stock: NumericValue;
  quantity_sold: NumericValue;
  expected_closing_stock: NumericValue;
  closing_stock: NumericValue;
  variance_stock: NumericValue;
  selling_price: NumericValue;
  revenue_generated: NumericValue;
  profit_generated: NumericValue;
  products: { name: string | null; unit: string | null } | null;
}

export const dailyClosureService = {
  /**
   * Fetches active products WITHOUT `current_stock` so the physical count
   * is genuinely blind at both the UI and network payload levels.
   */
  async getBlindCountSheet(barId: string): Promise<BlindProductCountRow[]> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, unit')
      .eq('bar_id', barId)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Failed to load products for stock count.');
    }

    return (data || []).map((row) => ({
      product_id: row.id,
      name: row.name,
      category: row.category || 'Uncategorized',
      unit: row.unit || 'bottle',
      actual_closing_stock: '',
    }));
  },

  /**
   * Suggests today's opening cash float from the immediately preceding closed day's actual cash.
   */
  async getSuggestedOpeningCash(barId: string, businessDate: string): Promise<number> {
    const { data } = await supabase
      .from('daily_closures')
      .select('actual_cash')
      .eq('bar_id', barId)
      .eq('status', 'closed')
      .lt('business_date', businessDate)
      .order('business_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    return Number(data?.actual_cash || 0);
  },

  /**
   * Executes the atomic `close_business_day` PostgreSQL RPC and returns the full
   * post-closure variance report.
   */
  async submitCloseBusinessDay(input: CloseBusinessDayInput): Promise<DailyClosureReport> {
    if (input.openingCash < 0 || input.actualCash < 0 || input.actualMpesa < 0) {
      throw new Error('Cash and M-PESA amounts cannot be negative.');
    }

    const { data: closureId, error } = await supabase.rpc('close_business_day', {
      p_bar_id: input.barId,
      p_business_date: input.businessDate,
      p_opening_cash: input.openingCash,
      p_actual_cash: input.actualCash,
      p_actual_mpesa: input.actualMpesa,
      p_blind_counts: input.blindCounts,
      p_notes: input.notes?.trim() || null,
    });

    if (error) {
      if (error.message?.includes('already closed')) {
        throw new Error(`Business date ${input.businessDate} has already been closed.`);
      }
      if (error.message?.includes('Unauthorized')) {
        throw new Error('Only a Manager or Owner can execute Close Day.');
      }
      throw new Error(error.message || 'Failed to close business day.');
    }

    return this.getClosureReportById(closureId as string);
  },

  /**
   * Retrieves a closed day's complete financial & stock variance breakdown.
   */
  async getClosureReportById(closureId: string): Promise<DailyClosureReport> {
    const { data: closure, error: closureErr } = await supabase
      .from('daily_closures')
      .select('*')
      .eq('id', closureId)
      .single();

    if (closureErr || !closure) {
      throw new Error(closureErr?.message || 'Could not load closure summary.');
    }

    const { data: itemRows, error: itemsErr } = await supabase
      .from('daily_closure_items')
      .select(`
        id,
        product_id,
        opening_stock,
        purchased_stock,
        wastage_stock,
        quantity_sold,
        expected_closing_stock,
        closing_stock,
        variance_stock,
        selling_price,
        revenue_generated,
        profit_generated,
        products ( name, unit )
      `)
      .eq('closure_id', closureId);

    if (itemsErr) {
      throw new Error(itemsErr.message);
    }

    const items = ((itemRows || []) as unknown as ClosureItemRow[]).map((row) => ({
      id: row.id,
      product_id: row.product_id,
      product_name: row.products?.name || 'Unknown Product',
      unit: row.products?.unit || 'unit',
      opening_stock: Number(row.opening_stock || 0),
      purchased_stock: Number(row.purchased_stock || 0),
      wastage_stock: Number(row.wastage_stock || 0),
      quantity_sold: Number(row.quantity_sold || 0),
      expected_closing_stock: Number(row.expected_closing_stock || 0),
      closing_stock: Number(row.closing_stock || 0),
      variance_stock: Number(row.variance_stock || 0),
      selling_price: Number(row.selling_price || 0),
      revenue_generated: Number(row.revenue_generated || 0),
      profit_generated: Number(row.profit_generated || 0),
    }));

    return {
      id: closure.id,
      bar_id: closure.bar_id,
      business_date: closure.business_date,
      status: closure.status,
      opening_cash: Number(closure.opening_cash || 0),
      cash_sales: Number(closure.cash_sales || 0),
      mpesa_sales: Number(closure.mpesa_sales || 0),
      expected_cash: Number(closure.expected_cash || 0),
      actual_cash: Number(closure.actual_cash || 0),
      expected_mpesa: Number(closure.expected_mpesa || 0),
      actual_mpesa: Number(closure.actual_mpesa || 0),
      total_expenses_cash: Number(closure.total_expenses_cash || 0),
      stock_variance_value: Number(closure.stock_variance_value || 0),
      profit_total: Number(closure.profit_total || 0),
      units_sold: Number(closure.units_sold || 0),
      notes: closure.notes,
      closed_at: closure.closed_at,
      items,
    };
  },
};