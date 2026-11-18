"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBarContext } from "@/hooks/useBarContext";
import { signOut } from "@/services/authService";
import { formatKes } from "@/services/dashboardService";
import { getOrderItems, getOrderMenu, orderReference, orderTotal, submitOrder, type MenuItem, type OrderDraft } from "@/services/orderService";

function readPending(key: string): OrderDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value && typeof value.requestId === "string" && typeof value.note === "string" && Array.isArray(value.lines)
      ? value
      : null;
  } catch {
    return null;
  }
}

function storePending(key: string, draft: OrderDraft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    // Retry protection still works in memory if storage is unavailable.
  }
}

function OrderForm({ barId, storageKey }: { barId: string; storageKey: string }) {
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries((pending?.lines ?? []).map((line) => [line.product_id, line.quantity])),
  );
  const [note, setNote] = useState(pending?.note ?? "");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [menuError, setMenuError] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ reference: string; total: number | null } | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    const loadMenu = async () => {
      try {
        const { data, error } = await getOrderMenu(barId);
        if (active) {
          setMenu(data ?? []);
          setMenuError(Boolean(error));
        }
      } catch {
        if (active) setMenuError(true);
      } finally {
        if (active) setMenuLoading(false);
      }
    };
    void loadMenu();
    return () => { active = false; };
  }, [barId, reloadKey]);

  const picked = menu.filter((item) => quantities[item.id] > 0);
  const count = picked.reduce((sum, item) => sum + quantities[item.id], 0);
  const estimate = picked.reduce((sum, item) => sum + quantities[item.id] * item.selling_price, 0);
  const query = search.trim().toLowerCase();
  const visibleMenu = menu.filter((item) =>
    [item.name, item.category, item.unit].some((label) => label?.toLowerCase().includes(query)),
  );

  function changeQuantity(id: string, change: number) {
    setSent(null);
    setQuantities((previous) => ({
      ...previous,
      [id]: Math.min(99, Math.max(0, (previous[id] ?? 0) + change)),
    }));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || (!pending && (count === 0 || picked.length > 50))) return;

    submitLock.current = true;
    setSending(true);
    setError("");
    setSent(null);

    try {
      const draft = pending ?? {
        requestId: crypto.randomUUID(),
        note: note.trim(),
        lines: picked.map((item) => ({ product_id: item.id, quantity: quantities[item.id] })),
      };
      storePending(storageKey, draft);
      setPending(draft);

      const { data, error } = await submitOrder(barId, draft);
      if (error?.code === "22023") {
        storePending(storageKey, null);
        setPending(null);
        setMenuLoading(true);
        setReloadKey((key) => key + 1);
        setError("The menu may have changed. Review your items before resending.");
      } else if (!data || error) {
        setError(error?.code === "42501"
          ? "Order access was denied. Ask the bar owner to check your access."
          : "Order not confirmed. Retry this same order to avoid duplicates.");
      } else {
        storePending(storageKey, null);
        setPending(null);
        setQuantities({});
        setNote("");
        setSearch("");
        setSent({ reference: orderReference(data), total: null });
        setReloadKey((key) => key + 1);
        const saved = await getOrderItems(data).catch(() => null);
        if (saved?.data) setSent({ reference: orderReference(data), total: orderTotal(saved.data.items) });
      }
    } catch {
      setError("Order not confirmed. Check your connection and retry.");
    } finally {
      submitLock.current = false;
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-4">
      {sent && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          Order #{sent.reference} sent to the bar dashboard.
          {sent.total !== null && ` Total ${formatKes(sent.total)}.`}
        </p>
      )}
      {pending && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          <p aria-live="polite">{sending ? "Sending your order…" : "An order is waiting for confirmation. Retry it before starting another order."}</p>
          {!sending && <p className="mt-1">{pending.lines.reduce((sum, line) => sum + line.quantity, 0)} items{pending.note ? ` · ${pending.note}` : ""}</p>}
        </div>
      )}
      <fieldset disabled={Boolean(pending) || sending} className="min-w-0 space-y-4 disabled:opacity-60">
        <div>
          <label htmlFor="order-note" className="mb-1 block text-sm font-medium">Pickup note (optional)</label>
          <input id="order-note" value={note} maxLength={120} placeholder="e.g. By the entrance"
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3" />
        </div>
        <div>
          <label htmlFor="menu-search" className="mb-1 block text-sm font-medium">Find an item</label>
          <input id="menu-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3" />
        </div>
        {menuLoading ? (
          <p role="status" className="text-sm text-slate-600">Loading menu…</p>
        ) : menuError ? (
          <button type="button" className="min-h-11 rounded-lg border px-3 text-sm"
            onClick={() => { setMenuLoading(true); setReloadKey((key) => key + 1); }}>
            Couldn’t load the menu. Try again
          </button>
        ) : visibleMenu.length === 0 ? (
          <p className="text-sm text-slate-600">{menu.length ? "No items match your search." : "No items are available for this bar yet."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {visibleMenu.map((item) => {
              const quantity = quantities[item.id] ?? 0;
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{item.name}</p>
                    <p className="break-words text-sm text-slate-600">{item.unit ? `${item.unit} · ` : ""}{formatKes(item.selling_price)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Remove one ${item.name}`} disabled={!quantity}
                      onClick={() => changeQuantity(item.id, -1)}
                      className="size-11 rounded-lg border border-slate-300 text-xl disabled:opacity-40">−</button>
                    <span aria-live="polite" className="w-7 text-center font-semibold tabular-nums">{quantity}</span>
                    <button type="button" aria-label={`Add one ${item.name}`} disabled={quantity >= 99}
                      onClick={() => changeQuantity(item.id, 1)}
                      className="size-11 rounded-lg bg-slate-950 text-xl text-white disabled:opacity-40">+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-slate-50 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!pending && picked.length > 50 && <p role="alert" className="text-sm text-red-700">Choose no more than 50 distinct products per order.</p>}
        {picked.length > 0 && !pending && (
          <p className="text-sm text-slate-600">{picked.map((item) => `${quantities[item.id]}× ${item.name}`).join(", ")}</p>
        )}
        <button type="submit" disabled={sending || (!pending && (menuLoading || count === 0 || picked.length > 50))}
          className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {sending ? "Sending…" : pending ? "Retry this order" : count ? `Send ${count} ${count === 1 ? "item" : "items"} · ${formatKes(estimate)}` : "Send order"}
        </button>
      </div>
    </form>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { loading, barContext, user } = useBarContext();
  const [signOutError, setSignOutError] = useState(false);

  if (loading || !user) {
    return <main className="p-5 text-sm" role="status">Checking sign-in…</main>;
  }

  const storageKey = `zentra:pending-order:${user.id}:${barContext?.barId}`;

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-sm text-slate-600">{barContext?.barName ?? "Zentra"}</p>
            <h1 className="text-2xl font-bold">New order</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm font-semibold">
            {barContext && barContext.role !== "staff" && (
              <Link href="/dashboard" className="flex min-h-11 items-center underline">Dashboard</Link>
            )}
            <button type="button" className="min-h-11 underline" onClick={async () => {
              const { error } = await signOut();
              if (error) setSignOutError(true);
              else router.replace("/login");
            }}>Sign out</button>
          </div>
        </header>
        {signOutError && <p role="alert" className="text-sm text-red-700">Couldn’t sign out. Please try again.</p>}
        {barContext
          ? <OrderForm key={storageKey} barId={barContext.barId} storageKey={storageKey} />
          : <p role="alert">No bar is available for this account. Ask your bar owner to check your access.</p>}
      </div>
    </main>
  );
}
