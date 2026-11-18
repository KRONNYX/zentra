"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatKes } from "@/services/dashboardService";
import { advanceOrder, listOpenOrders, orderReference, type BarOrder } from "@/services/orderService";

export default function LiveOrdersPanel({ barId }: { barId: string }) {
  const [orders, setOrders] = useState<BarOrder[] | null>(null);
  const [live, setLive] = useState(false);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let running = false;
    let queued = false;

    const load = async () => {
      if (!active) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const { data, error } = await listOpenOrders(barId);
        if (active) {
          setStale(Boolean(error));
          if (!error) setOrders(data ?? []);
        }
      } catch {
        if (active) setStale(true);
      } finally {
        running = false;
        if (queued) {
          queued = false;
          void load();
        }
      }
    };

    refresh.current = () => { void load(); };
    const channel = supabase
      .channel(`bar-orders:${barId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bar_orders",
        filter: `bar_id=eq.${barId}`,
      }, refresh.current)
      .subscribe((status) => {
        if (!active) return;
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void load();
      });

    const timer = window.setInterval(refresh.current, 10000);
    window.addEventListener("focus", refresh.current);
    window.addEventListener("online", refresh.current);
    void load();

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh.current);
      window.removeEventListener("online", refresh.current);
      refresh.current = () => {};
      void supabase.removeChannel(channel);
    };
  }, [barId]);

  async function updateStatus(order: BarOrder, status: "ready" | "served") {
    if (saving) return;
    setSaving(order.id);
    setError("");
    try {
      const { error } = await advanceOrder(barId, order.id, status);
      if (error) throw error;
      setOrders((current) => current?.flatMap((item) => item.id !== order.id
        ? [item]
        : status === "served" ? [] : [{ ...item, status }]) ?? null);
    } catch {
      setError(`Couldn’t confirm the update for #${orderReference(order.id)}. Refreshing orders; try again if needed.`);
    } finally {
      refresh.current();
      setSaving(null);
    }
  }

  return (
    <section aria-labelledby="live-orders" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="live-orders" className="text-lg font-bold">Bar orders</h2>
          <p className="text-sm text-slate-600" role="status">
            {stale ? "Updates interrupted"
              : live ? "Live updates"
              : "Checking every 10 seconds"}
            {orders && !stale ? ` · ${orders.length === 100 ? "100+" : orders.length} open` : ""}
          </p>
        </div>
        <Link href="/orders" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold">
          New order
        </Link>
      </div>

      {stale && (
        <p role="alert" className="text-sm text-amber-900">
          Couldn’t refresh orders. The list may be out of date.{" "}
          <button type="button" className="min-h-11 font-semibold underline" onClick={() => refresh.current()}>Retry now</button>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!orders && !stale && <p className="text-sm text-slate-600">Loading orders…</p>}
      {orders?.length === 0 && !stale && <p className="text-sm text-slate-600">No open orders. New orders will appear here.</p>}
      {!!orders?.length && (
        <ol className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {orders.map((order) => (
            <li key={order.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">#{orderReference(order.id)}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${order.status === "ready" ? "bg-emerald-100 text-emerald-900" : "bg-blue-100 text-blue-900"}`}>
                  {order.status === "ready" ? "Ready" : "New"}
                </span>
              </div>
              <time dateTime={order.created_at} className="text-sm text-slate-600">{new Date(order.created_at).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}</time>
              {order.note && <p className="break-words text-sm font-medium">{order.note}</p>}
              <ul className="mb-2 grow space-y-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.product_id} className="break-words">{item.quantity} × {item.name}{item.unit ? ` (${item.unit})` : ""}</li>
                ))}
              </ul>
              <p className="text-sm text-slate-600">Order total: {formatKes(order.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0))}</p>
              <button type="button" disabled={Boolean(saving) || stale}
                onClick={() => updateStatus(order, order.status === "new" ? "ready" : "served")}
                className="min-h-11 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white disabled:opacity-50">
                {saving === order.id ? "Updating…" : order.status === "new" ? "Mark ready" : "Mark served"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
