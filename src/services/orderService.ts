import { supabase } from '@/lib/supabaseClient';

export interface PosCartItem {
  product_id: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

export interface SubmitOrderPayload {
  barId: string;
  businessDate: string; // YYYY-MM-DD
  items: PosCartItem[];
  paymentMode: 'cash' | 'mpesa' | 'split' | 'tab';
  cashAmount?: number;
  mpesaAmount?: number;
  mpesaCode?: string;
  mpesaPhone?: string;
  customerName?: string;
  notes?: string;
}

export interface OpenTabRecord {
  id: string;
  customer_name: string;
  amount: number;
  staff_name: string;
  business_date: string;
  notes: string | null;
  created_at: string;
}

/**
 * Normalizes and validates standard Safaricom M-PESA confirmation codes (e.g., SL94K2M1P0).
 */
export function normalizeMpesaCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function isValidMpesaCode(code: string): boolean {
  const normalized = normalizeMpesaCode(code);
  // Standard Safaricom receipt codes are 10 alphanumeric characters
  return /^[A-Z0-9]{10}$/.test(normalized);
}

/**
 * Translates raw Postgres / Supabase RPC exceptions into clear staff-facing messages.
 */
function mapPosError(error: { code?: string; message?: string }): Error {
  const msg = error.message || 'Failed to record order.';

  if (error.code === '23505' || msg.includes('idx_mpesa_unique_receipt_per_bar')) {
    return new Error('Duplicate M-PESA Code: This confirmation code has already been used for another order.');
  }
  if (msg.includes('ERR_PERIOD_LOCKED')) {
    return new Error('Business Day Closed: Sales cannot be recorded for a closed date.');
  }
  if (msg.includes('Payment mismatch')) {
    return new Error('Payment amounts do not match the order total.');
  }
  return new Error(msg);
}

export const orderService = {
  /**
   * Executes the atomic `record_pos_sale` PostgreSQL RPC.
   */
  async createOrder(payload: SubmitOrderPayload): Promise<string> {
    const total = payload.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );

    if (payload.items.length === 0 || total <= 0) {
      throw new Error('Add at least one drink to the order.');
    }

    const isTab = payload.paymentMode === 'tab';
    let cashAmount = 0;
    let mpesaAmount = 0;
    let cleanCode: string | null = null;

    if (!isTab) {
      if (payload.paymentMode === 'cash') {
        cashAmount = total;
      } else if (payload.paymentMode === 'mpesa') {
        mpesaAmount = total;
      } else if (payload.paymentMode === 'split') {
        cashAmount = Number(payload.cashAmount || 0);
        mpesaAmount = Number(payload.mpesaAmount || 0);
      }

      if (cashAmount + mpesaAmount !== total) {
        throw new Error(
          `Cash (KES ${cashAmount}) + M-PESA (KES ${mpesaAmount}) must equal KES ${total}.`
        );
      }

      if (mpesaAmount > 0) {
        cleanCode = normalizeMpesaCode(payload.mpesaCode || '');
        if (!isValidMpesaCode(cleanCode)) {
          throw new Error('Enter a valid 10-character M-PESA confirmation code (e.g. SL94K2M1P0).');
        }
      }
    } else if (!payload.customerName?.trim()) {
      throw new Error('Enter the customer name to open a tab.');
    }

    const rpcItems = payload.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const { data, error } = await supabase.rpc('record_pos_sale', {
      p_bar_id: payload.barId,
      p_business_date: payload.businessDate,
      p_items: rpcItems,
      p_cash_amount: cashAmount,
      p_mpesa_amount: mpesaAmount,
      p_mpesa_code: cleanCode,
      p_mpesa_phone: payload.mpesaPhone?.trim() || null,
      p_is_tab: isTab,
      p_customer_name: payload.customerName?.trim() || null,
      p_notes: payload.notes?.trim() || null,
    });

    if (error) {
      throw mapPosError(error);
    }

    return data as string;
  },

  /**
   * Fetches all unpaid customer tabs for the active bar.
   */
  async getOpenTabs(barId: string): Promise<OpenTabRecord[]> {
    const { data, error } = await supabase
      .from('customer_credits')
      .select('id, customer_name, amount, staff_name, business_date, notes, created_at')
      .eq('bar_id', barId)
      .eq('status', 'unpaid')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []) as OpenTabRecord[];
  },

  /**
   * Settles an open customer tab via Cash or M-PESA.
   */
  async settleTab(params: {
    barId: string;
    tabId: string;
    amount: number;
    method: 'cash' | 'mpesa';
    mpesaCode?: string;
    businessDate: string;
    userId: string;
  }): Promise<void> {
    let cleanCode: string | null = null;

    if (params.method === 'mpesa') {
      cleanCode = normalizeMpesaCode(params.mpesaCode || '');
      if (!isValidMpesaCode(cleanCode)) {
        throw new Error('Enter a valid 10-character M-PESA confirmation code.');
      }

      const { error: mpesaErr } = await supabase.from('mpesa_transactions').insert({
        bar_id: params.barId,
        staff_id: params.userId,
        phone_number: 'TAB_SETTLEMENT',
        amount: params.amount,
        transaction_type: 'tab_settlement',
        transaction_code: cleanCode,
        status: 'matched',
      });

      if (mpesaErr) throw mapPosError(mpesaErr);
    }

    // Record settlement sale entry so daily cash/mpesa reconciliation stays balanced
    const { error: saleErr } = await supabase.from('sales').insert({
      bar_id: params.barId,
      staff_id: params.userId,
      sale_date: params.businessDate,
      sold_at: new Date().toISOString(),
      total_amount: params.amount,
      cash_amount: params.method === 'cash' ? params.amount : 0,
      mpesa_amount: params.method === 'mpesa' ? params.amount : 0,
      status: 'paid',
      notes: `Tab Settlement (${params.tabId})`,
    });

    if (saleErr) throw mapPosError(saleErr);

    const { error: tabErr } = await supabase
      .from('customer_credits')
      .update({
        status: 'settled',
        settled_date: params.businessDate,
        settled_business_date: params.businessDate,
        settled_at: new Date().toISOString(),
        settled_by: params.userId,
      })
      .eq('id', params.tabId)
      .eq('bar_id', params.barId);

    if (tabErr) throw new Error(tabErr.message);
  },
};