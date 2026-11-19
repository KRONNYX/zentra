'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Smartphone,
  Banknote,
  Receipt,
  X,
} from 'lucide-react';
import { useBarContext } from '@/hooks/useBarContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import {
  orderService,
  PosCartItem,
  OpenTabRecord,
  isValidMpesaCode,
} from '@/services/orderService';
import { Button } from '@/components/ui/button';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  current_stock: number;
}

export default function PosOrdersPage() {
  // NEW
  // At the top of OrdersPage():
  const { barContext, loading: authLoading, error: barError, user } = useBarContext();
  const activeBar = barContext
  ? { id: barContext.barId, name: barContext.barName }
  : null;

  const [activeView, setActiveView] = useState<'pos' | 'tabs'>('pos');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTabRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Cart state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Checkout Form state
  const [paymentMode, setPaymentMode] = useState<'cash' | 'mpesa' | 'split' | 'tab'>('mpesa');
  const [cashInput, setCashInput] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Settle Tab modal state
  const [settlingTab, setSettlingTab] = useState<OpenTabRecord | null>(null);
  const [settleMethod, setSettleMethod] = useState<'cash' | 'mpesa'>('mpesa');
  const [settleCode, setSettleCode] = useState('');

  const businessDate = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    if (!activeBar?.id) return;
    setLoading(true);
    try {
      const [{ data: prodData, error: prodErr }, tabsData] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, category, unit, selling_price, current_stock')
          .eq('bar_id', activeBar.id)
          .eq('is_active', true)
          .order('name'),
        orderService.getOpenTabs(activeBar.id),
      ]);

      if (prodErr) throw prodErr;
      setProducts((prodData || []) as ProductItem[]);
      setOpenTabs(tabsData);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to load POS data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!activeBar?.id) {
      setLoading(false);
      return;
    }
    loadData();
  }, [authLoading, activeBar?.id]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addToCart = (product: ProductItem) => {
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unit_price: Number(product.selling_price || 0),
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product_id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const resetCheckout = () => {
    setCart([]);
    setCashInput('');
    setMpesaCode('');
    setMpesaPhone('');
    setCustomerName('');
    setIsCheckoutOpen(false);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBar?.id) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const parsedCash = Number(cashInput || 0);
      const computedMpesa =
        paymentMode === 'split' ? Math.max(0, cartTotal - parsedCash) : cartTotal;

      await orderService.createOrder({
        barId: activeBar.id,
        businessDate,
        items: cart,
        paymentMode,
        cashAmount: paymentMode === 'split' ? parsedCash : paymentMode === 'cash' ? cartTotal : 0,
        mpesaAmount:
          paymentMode === 'split' ? computedMpesa : paymentMode === 'mpesa' ? cartTotal : 0,
        mpesaCode,
        mpesaPhone,
        customerName,
      });

      resetCheckout();
      setFeedback({
        type: 'success',
        text:
          paymentMode === 'tab'
            ? `Tab opened for ${customerName} (KES ${cartTotal.toLocaleString()})`
            : `Order recorded — KES ${cartTotal.toLocaleString()}`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBar?.id || !user?.id || !settlingTab) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      await orderService.settleTab({
        barId: activeBar.id,
        tabId: settlingTab.id,
        amount: Number(settlingTab.amount),
        method: settleMethod,
        mpesaCode: settleCode,
        businessDate,
        userId: user.id,
      });
      setSettlingTab(null);
      setSettleCode('');
      setFeedback({
        type: 'success',
        text: `Settled ${settlingTab.customer_name}'s tab (KES ${Number(settlingTab.amount).toLocaleString()}).`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28">
      {/* Top Bar: POS vs Open Tabs Switcher */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              {activeBar?.name || 'Bar POS'}
            </h1>
            <p className="text-xs text-zinc-400">Shift Date: {businessDate}</p>
          </div>

          <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveView('pos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === 'pos'
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Sell Drinks
            </button>
            <button
              type="button"
              onClick={() => setActiveView('tabs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeView === 'tabs'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Open Tabs
              {openTabs.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-950 text-amber-400 text-[10px]">
                  {openTabs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Status Banner */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className={`mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button type="button" onClick={() => setFeedback(null)}>
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Category Pills (POS Mode) */}
        {activeView === 'pos' && (
          <>
            <div className="relative mb-2.5">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Tusker, Gilbeys, Guarana..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      
      
      {/* MAIN CONTENT: DRINK GRID OR OPEN TABS */}
      <div className="p-4">
        {authLoading || loading ? (
        <div className="p-8 text-center text-zinc-400 text-sm">Loading counter...</div>
      ) : !user ? (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm text-zinc-400">You need to sign in to access the POS counter.</p>
          <a
            href="/login"
            className="inline-block px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-sm"
          >
            Go to Login
          </a>
        </div>
      ) : !activeBar ? (
        <div className="p-8 text-center text-sm text-rose-400">
          {barError || 'No active bar linked to your account yet.'}
        </div>
      ) : activeView === 'pos' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const inCart = cart.find((c) => c.product_id === product.id);
              return (
                <motion.button
                  key={product.id}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => addToCart(product)}
                  className={`relative text-left p-3.5 rounded-2xl border transition flex flex-col justify-between min-h-[112px] ${
                    inCart
                      ? 'bg-emerald-500/10 border-emerald-500/60'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {inCart && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center justify-center shadow">
                      {inCart.quantity}
                    </span>
                  )}
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                      {product.category}
                    </span>
                    <h3 className="font-semibold text-sm text-zinc-100 leading-snug mt-0.5 line-clamp-2">
                      {product.name}
                    </h3>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-sm font-bold text-emerald-400">
                      KES {Number(product.selling_price).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {product.current_stock} left
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          /* OPEN TABS VIEW */
          <div className="space-y-3">
            {openTabs.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                <p className="text-sm text-zinc-400">No unpaid customer tabs right now.</p>
              </div>
            ) : (
              openTabs.map((tab) => (
                <div
                  key={tab.id}
                  className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="font-bold text-base text-zinc-100">{tab.customer_name}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Opened by {tab.staff_name} • {tab.business_date}
                    </p>
                    <p className="text-sm font-bold text-amber-400 mt-1">
                      KES {Number(tab.amount).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      setSettlingTab(tab);
                      setSettleMethod('mpesa');
                      setSettleCode('');
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold"
                  >
                    Settle Tab
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* STICKY BOTTOM CART BAR */}
      {activeView === 'pos' && cart.length > 0 && !isCheckoutOpen && (
        <div className="fixed bottom-16 md:bottom-4 inset-x-4 z-30">
          <motion.button
            type="button"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsCheckoutOpen(true)}
            className="w-full max-w-xl mx-auto flex items-center justify-between bg-emerald-500 text-zinc-950 font-bold px-5 py-4 rounded-2xl shadow-xl shadow-emerald-950/50"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5" />
              <span>
                {cartCount} {cartCount === 1 ? 'Drink' : 'Drinks'}
              </span>
            </div>
            <span className="text-base">Charge KES {cartTotal.toLocaleString()} &rarr;</span>
          </motion.button>
        </div>
      )}

      {/* CHECKOUT DRAWER / MODAL */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.22 }}
              className="w-full max-w-lg bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h2 className="text-lg font-bold">Complete Order</h2>
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart Line Items */}
              <div className="divide-y divide-zinc-800 my-3 max-h-48 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.product_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-zinc-400">
                        KES {item.unit_price.toLocaleString()} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.product_id, -1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </button>
                      <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.product_id, 1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-zinc-950 border border-zinc-800 mb-4">
                <span className="text-sm text-zinc-400">Total Payable</span>
                <span className="text-xl font-extrabold text-emerald-400">
                  KES {cartTotal.toLocaleString()}
                </span>
              </div>

              {/* Payment Method Selector */}
              <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'mpesa', label: 'M-PESA', icon: Smartphone },
                    { id: 'cash', label: 'Cash', icon: Banknote },
                    { id: 'split', label: 'Split', icon: Receipt },
                    { id: 'tab', label: 'Open Tab', icon: UserPlus },
                  ].map((mode) => {
                    const Icon = mode.icon;
                    const active = paymentMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setPaymentMode(mode.id as any)}
                        className={`py-2.5 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                {paymentMode === 'split' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Cash Amount (KES)</label>
                      <input
                        type="number"
                        min={1}
                        max={cartTotal - 1}
                        required
                        value={cashInput}
                        onChange={(e) => setCashInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm"
                        placeholder="e.g. 500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">M-PESA Balance</label>
                      <div className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-bold text-emerald-400">
                        KES {Math.max(0, cartTotal - Number(cashInput || 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {(paymentMode === 'mpesa' || paymentMode === 'split') && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        M-PESA Confirmation Code (10 Characters) *
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        required
                        value={mpesaCode}
                        onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                        placeholder="e.g. SL94K2M1P0"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-mono uppercase tracking-wider focus:border-emerald-500 focus:outline-none"
                      />
                      {mpesaCode.length > 0 && !isValidMpesaCode(mpesaCode) && (
                        <p className="text-[11px] text-amber-400 mt-1">
                          Must be exactly 10 letters/numbers from the M-PESA SMS.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Customer Phone (Optional)
                      </label>
                      <input
                        type="tel"
                        value={mpesaPhone}
                        onChange={(e) => setMpesaPhone(e.target.value)}
                        placeholder="07XX XXX XXX"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                )}

                {paymentMode === 'tab' && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Customer Name / Table *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Brian - Counter Stool 3"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-base"
                >
                  {submitting
                    ? 'Saving...'
                    : paymentMode === 'tab'
                    ? 'Confirm Open Tab'
                    : `Confirm KES ${cartTotal.toLocaleString()} Payment`}
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTLE TAB MODAL */}
      <AnimatePresence>
        {settlingTab && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Settle Tab: {settlingTab.customer_name}</h3>
                <button type="button" onClick={() => setSettlingTab(null)}>
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-zinc-400">
                Amount Due:{' '}
                <span className="font-bold text-amber-400">
                  KES {Number(settlingTab.amount).toLocaleString()}
                </span>
              </p>

              <form onSubmit={handleSettleTab} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('mpesa')}
                    className={`py-2.5 rounded-xl border text-xs font-semibold ${
                      settleMethod === 'mpesa'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    M-PESA
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleMethod('cash')}
                    className={`py-2.5 rounded-xl border text-xs font-semibold ${
                      settleMethod === 'cash'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    Cash
                  </button>
                </div>

                {settleMethod === 'mpesa' && (
                  <input
                    type="text"
                    maxLength={10}
                    required
                    value={settleCode}
                    onChange={(e) => setSettleCode(e.target.value.toUpperCase())}
                    placeholder="10-Char M-PESA Code"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-mono uppercase"
                  />
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold"
                >
                  {submitting ? 'Settling...' : 'Mark Tab Paid'}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}