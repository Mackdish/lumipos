import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { KITCHEN_LABELS, KITCHEN_STATUSES, formatMoney, formatTime, orderCode, type KitchenStatus, type Order } from "@/lib/pos";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders | Bingo Hotel Order Book" },
      { name: "description", content: "Search every hotel food order with payment method, status and takings." },
      { property: "og:title", content: "Orders | Bingo Hotel Order Book" },
      { property: "og:description", content: "Search every hotel food order with payment method, status and takings." },
    ],
  }),
  component: OrdersPage,
});

const filters = ["All", "PAID", "PENDING", ...KITCHEN_STATUSES] as const;

function OrdersPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(id, name, quantity, price)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const visible = orders.filter((o) => {
    const matchesFilter = filter === "All" || o.payment_status === filter || o.kitchen_status === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || o.customer.toLowerCase().includes(q) || o.employee_name.toLowerCase().includes(q) || orderCode(o).toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every order recorded by the team.</p>

        <div className="mt-5 space-y-3 sm:mt-6">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, staff or order number" className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {filters.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-bold ${filter === f ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                {(KITCHEN_LABELS as Record<string, string>)[f] ?? f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading orders...</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No orders match this view.</p>
        ) : (
          <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-5">
            {visible.map((order) => (
              <Link key={order.id} to="/orders/$id" params={{ id: order.id }} className="block rounded-2xl border border-border bg-card p-4 transition hover:bg-muted sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold sm:text-base">{orderCode(order)} · {order.customer}</p>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{order.employee_name} · {formatTime(order.created_at)} · {order.payment_method}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold sm:text-base">{formatMoney(Number(order.total))}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">{order.payment_status}</span>
                  <span className="rounded-full bg-muted px-2.5 py-1">{KITCHEN_LABELS[order.kitchen_status as KitchenStatus] ?? order.kitchen_status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
