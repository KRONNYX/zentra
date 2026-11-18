import { supabase } from "@/lib/supabaseClient";

export type MenuItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  selling_price: number;
};

export type OrderItem = {
  product_id: string;
  name: string;
  unit: string | null;
  unit_price: number;
  quantity: number;
};

export type BarOrder = {
  id: string;
  created_at: string;
  note: string;
  status: "new" | "ready" | "served";
  items: OrderItem[];
};

export type OrderDraft = {
  requestId: string;
  note: string;
  lines: Pick<OrderItem, "product_id" | "quantity">[];
};

export function orderReference(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export async function getOrderMenu(barId: string) {
  const { data, error } = await supabase.rpc("get_order_menu", { p_bar_id: barId });
  return { data: (data ?? null) as MenuItem[] | null, error };
}

export async function submitOrder(barId: string, draft: OrderDraft) {
  const { data, error } = await supabase
    .rpc("submit_bar_order", {
      p_bar_id: barId,
      p_request_id: draft.requestId,
      p_note: draft.note,
      p_items: draft.lines,
    })
    .abortSignal(AbortSignal.timeout(15000));
  return { data: typeof data === "string" ? data : null, error };
}

export async function listOpenOrders(barId: string) {
  return supabase
    .from("bar_orders")
    .select("id, created_at, note, status, items")
    .eq("bar_id", barId)
    .in("status", ["new", "ready"])
    .order("created_at")
    .order("id")
    .limit(100)
    .returns<BarOrder[]>();
}

export async function advanceOrder(barId: string, orderId: string, status: "ready" | "served") {
  return supabase.rpc("advance_bar_order", {
    p_bar_id: barId,
    p_order_id: orderId,
    p_status: status,
  });
}
