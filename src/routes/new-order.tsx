import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, type MenuItem, type OrderItem } from "@/lib/pos";
import { toast } from "sonner";

export const Route = createFileRoute("/new-order")({
  head: () => ({
    meta: [
      { title: "New order | Bingo Hotel Order Book" },
      { name: "description", content: "Take a new food order, pick menu items and record cash or M-Pesa payment." },
      { property: "og:title", content: "New order | Bingo Hotel Order Book" },
      { property: "og:description", content: "Take a new food order and record cash or M-Pesa payment in seconds." },
    ],
  }),
  component: NewOrder,
});

function NewOrder() {
  const router = useRouter();
  const { user, displayName } = useAuth();
  const [customer, setCustomer] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const { data: menu = [], isLoading } = useQuery({
    queryKey: ["menu_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").order("category").order("name");
      if (error) throw error;
      return data as unknown as MenuItem[];
    },
  });

  const categories = useMemo(() => Array.from(new Set(menu.map((m) => m.category))), [menu]);
  const items: OrderItem[] = menu
    .filter((m) => (lines[m.id] ?? 0) > 0)
    .map((m) => ({ name: m.name, quantity: lines[m.id]!, price: Number(m.price) }));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function bump(id: string, delta: number) {
    setLines((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  async function submit() {
    if (!customer.trim()) {
      toast.error("Add a customer name");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one menu item");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("orders").insert({
      customer: customer.trim(),
      employee_id: user?.id ?? null,
      employee_name: displayName,
      payment_method: paymentMethod,
      payment_status: paymentMethod === "Cash" ? "PAID" : "PENDING",
      order_status: "OPEN",
      kitchen_status: "OPEN",
      total,
      notes: notes.trim() || null,
    }).select("id").single();

    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the order");
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      items.map((i) => ({ order_id: data.id, name: i.name, quantity: i.quantity, price: i.price })),
    );
    setSaving(false);
    if (itemsError) {
      toast.error(itemsError.message);
      return;
    }
    toast.success("Order saved");
    router.navigate({ to: "/orders/$id", params: { id: data.id } });
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">New order</h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose dishes and record payment.</p>
          </div>
          <div className="rounded-xl bg-muted px-3 py-2 text-xs font-bold sm:hidden">{items.length} items</div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:mt-8 lg:gap-6">
          <section className="space-y-4 sm:space-y-6">
            {isLoading && <p className="text-sm text-muted-foreground">Loading menu...</p>}
            {categories.map((category) => (
              <div key={category} className="overflow-hidden rounded-2xl border border-border bg-card">
                <h2 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:p-4 sm:text-sm">{category}</h2>
                <ul className="divide-y divide-border">
                  {menu.filter((m) => m.category === category).map((m) => (
                    <li key={m.id} className="flex min-h-16 items-center justify-between gap-3 px-3 py-3 sm:p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold sm:text-base">{m.name}</p>
                        <p className="text-xs text-muted-foreground sm:text-sm">{formatMoney(Number(m.price))}{!m.is_available && " · unavailable"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <button type="button" aria-label={`Remove one ${m.name}`} onClick={() => bump(m.id, -1)} className="grid h-10 w-10 place-items-center rounded-xl border border-border text-lg font-bold active:scale-95">−</button>
                        <span className="w-7 text-center text-sm font-bold">{lines[m.id] ?? 0}</span>
                        <button type="button" aria-label={`Add one ${m.name}`} disabled={!m.is_available} onClick={() => bump(m.id, 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-40">+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-6">
            <h2 className="text-lg font-bold">Order summary</h2>
            <label className="mt-4 block text-sm font-semibold">Customer name
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label className="mt-4 block text-sm font-semibold">Payment method
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                <option value="Cash">Cash</option>
                <option value="M-Pesa">M-Pesa</option>
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              {items.length === 0 && <li className="text-muted-foreground">No items yet.</li>}
              {items.map((i) => <li key={i.name} className="flex justify-between gap-2"><span>{i.quantity} × {i.name}</span><span className="shrink-0 font-semibold">{formatMoney(i.price * i.quantity)}</span></li>)}
            </ul>
            <p className="mt-4 flex justify-between border-t border-border pt-4 text-base font-bold"><span>Total</span><span>{formatMoney(total)}</span></p>
            <button onClick={submit} disabled={saving} className="mt-5 h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm active:scale-[.99] disabled:opacity-60">{saving ? "Saving..." : "Save order"}</button>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
