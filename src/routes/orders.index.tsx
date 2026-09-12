import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatTime, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders | Bingo Hotel Order Book" },
      {
        name: "description",
        content: "Search every hotel food order with payment method, status and takings.",
      },
      { property: "og:title", content: "Orders | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "Search every hotel food order with payment method, status and takings.",
      },
    ],
  }),
  component: OrdersPage,
});

const filters = ["All", "PAID", "PENDING"] as const;

function OrdersPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const visible = orders.filter((o) => {
    const matchesFilter = filter === "All" || o.payment_status === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.customer.toLowerCase().includes(q) ||
      o.employee_name.toLowerCase().includes(q) ||
      orderCode(o).toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every order recorded by the team.</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, staff or order number"
            className="min-w-[240px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-card">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading orders...</p>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No orders match this view.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((order) => (
                <li key={order.id}>
                  <Link
                    to="/orders/$id"
                    params={{ id: order.id }}
                    className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                  >
                    <div>
                      <p className="font-bold">
                        {orderCode(order)} · {order.customer}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.employee_name} · {formatTime(order.created_at)} ·{" "}
                        {order.payment_method}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMoney(Number(order.total))}</p>
                      <p className="text-xs font-bold text-muted-foreground">
                        {order.payment_status}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
