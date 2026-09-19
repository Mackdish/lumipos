import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, type MenuItem, type OrderItem } from "@/lib/pos";
import { ArrowDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/new-order")({
  head: () => ({
    meta: [
      { title: "New order | TillBook" },
      { name: "description", content: "Create a restaurant order and record payment." },
    ],
  }),
  component: NewOrder,
});

function NewOrder() {
  const queryClient = useQueryClient();
  const { user, displayName } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [lines, setLines] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const {
    data: menu = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["menu_items"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_items")
        .select("id, name, category, price, is_available, image_url")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MenuItem[];
    },
  });

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((m) => m.category)))],
    [menu],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleMenu = useMemo(
    () =>
      menu.filter(
        (m) =>
          m.is_available &&
          (activeCategory === "All" || m.category === activeCategory) &&
          (!normalizedSearch || m.name.toLowerCase().includes(normalizedSearch)),
      ),
    [menu, activeCategory, normalizedSearch],
  );
  const items: OrderItem[] = menu
    .filter((m) => (lines[m.id] ?? 0) > 0)
    .map((m) => ({ name: m.name, quantity: lines[m.id]!, price: Number(m.price) }));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  function bump(id: string, delta: number) {
    setLines((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  function scrollToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }

  function generateClientId() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    return `CL-${timestamp}-${suffix}`;
  }

  async function submit(paymentStatus: "PAID" | "PENDING" = paymentMethod === "Cash" ? "PAID" : "PAID") {
    if (items.length === 0) return toast.error("Add at least one menu item");
    setSaving(true);
    const clientId = generateClientId();
    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer: clientId,
        employee_id: user?.id ?? null,
        employee_name: displayName,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        order_status: "OPEN",
        total,
        notes: notes.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the order");
      return;
    }
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(
        items.map((i) => ({
          order_id: data.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      );
    setSaving(false);
    if (itemsError) {
      toast.error(itemsError.message);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success(
      paymentStatus === "PAID" ? `Order saved · ${clientId}` : `Order marked pending · ${clientId}`,
    );
    setLines({});
    setNotes("");
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <div className="flex items-center justify-between gap-3 rounded-[28px] border border-primary/10 bg-gradient-to-r from-primary via-primary to-[#1b7a5c] p-4 text-primary-foreground shadow-[0_18px_40px_rgba(15,93,76,0.18)] sm:p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-primary-foreground/85">
              Point of sale
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">New order</h1>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold backdrop-blur-sm sm:hidden">
            {itemCount} items
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section className="min-w-0">
            <div className="sticky top-14 z-20 rounded-2xl border border-border bg-background/95 p-2 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu..."
                aria-label="Search menu"
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div
                className="mt-2 flex gap-2 overflow-x-auto pb-1"
                role="tablist"
                aria-label="Menu categories"
              >
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === category}
                    onClick={() => setActiveCategory(category)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeCategory === category ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            {isLoading && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="h-52 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            )}
            {isError && (
              <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
                Unable to load the menu. Please refresh and try again.
              </div>
            )}
            {!isLoading && !isError && visibleMenu.length === 0 && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No available menu items match your search.
              </div>
            )}
            {!isLoading && !isError && visibleMenu.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleMenu.map((m) => {
                  const quantity = lines[m.id] ?? 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => bump(m.id, 1)}
                      aria-label={`Add ${m.name} to order`}
                      className={`group overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 ${quantity ? "border-primary/60 ring-1 ring-primary/20" : "border-border"}`}
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        {m.image_url ? (
                          <img
                            src={m.image_url}
                            alt={m.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-sm font-semibold text-muted-foreground">
                            No image
                          </div>
                        )}
                        {quantity > 0 && (
                          <span className="absolute right-2 top-2 grid h-8 min-w-8 place-items-center rounded-full bg-primary px-2 text-xs font-black text-primary-foreground shadow">
                            {quantity}
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {m.category}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="truncate font-bold">{m.name}</p>
                          <p className="shrink-0 text-sm font-black text-primary">
                            {formatMoney(Number(m.price))}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Tap to add</span>
                          {quantity > 0 && (
                            <span className="text-xs font-bold text-primary">
                              {quantity} selected
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          <aside className="h-fit rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Current order</h2>
                <p className="text-xs text-muted-foreground">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </p>
              </div>
              {itemCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLines({})}
                  className="text-xs font-bold text-destructive"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-4 rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">
              A time-coded client ID is generated automatically when this order is recorded.
            </div>
            <label className="mt-3 block text-sm font-semibold">
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="Cash">Cash</option>
                <option value="M-Pesa">M-Pesa</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional order note"
                className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="mt-4 border-t border-border pt-4">
              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Select a product card to start.
                </p>
              ) : (
                <ul className="space-y-3">
                  {items.map((i) => (
                    <li key={i.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <b>{i.quantity}×</b> {i.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const menuItem = menu.find((m) => m.name === i.name);
                            if (menuItem) bump(menuItem.id, -1);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border font-bold"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-xs font-bold">{i.quantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const menuItem = menu.find((m) => m.name === i.name);
                            if (menuItem) bump(menuItem.id, 1);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="font-bold">Total</span>
              <span className="text-xl font-black">{formatMoney(total)}</span>
            </div>
            {paymentMethod === "Cash" ? (
              <button
                onClick={() => submit("PAID")}
                disabled={saving || items.length === 0}
                className="mt-4 h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-50"
              >
                {saving ? "Saving order..." : "Save Order"}
              </button>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => submit("PAID")}
                  disabled={saving || items.length === 0}
                  className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-50"
                >
                  {saving ? "Approving..." : "Approve Order"}
                </button>
                <button
                  onClick={() => submit("PENDING")}
                  disabled={saving || items.length === 0}
                  className="h-12 rounded-xl border border-border bg-background text-sm font-bold text-foreground shadow-sm disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Pending"}
                </button>
              </div>
            )}
          </aside>
        </div>
      </main>
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label="Scroll to bottom"
        title="Scroll to bottom"
        className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-xl transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 sm:bottom-7 sm:right-7 sm:h-12 sm:w-12"
      >
        <ArrowDown className="h-5 w-5" aria-hidden="true" />
      </button>
    </AppShell>
  );
}
